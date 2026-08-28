-- Queue — a crew phone with a wrong clock must not vanish from dispatch
--
-- FOUND BY ACCIDENT, WHICH IS THE POINT. A verification run today failed to
-- produce any candidate units. The supply probe said:
--
--   units_on_shift 2 · units_with_recent_fix 0 · oldest_fix_seconds 4351
--
-- while the location write had just returned true. The cause was not the code:
-- the machine issuing the ping had a clock 4220 seconds slow (confirmed with
-- sntp). It stamped recorded_at 70 minutes in the past, Postgres compared that
-- against its own correct now(), and the unit was — correctly, by the rules as
-- written — treated as stale and excluded.
--
-- That is a test artefact. The production version of it is not:
--
--   * A crew phone whose clock runs slow is INVISIBLE to dispatch while the
--     crew sit on duty watching an app that says they are online. Android
--     devices lose time; a phone that has been off, or has a dead cell radio
--     and no NTP, drifts.
--   * A phone whose clock runs fast is worse: every fix looks fresh forever, so
--     the unit stays dispatchable long after it stopped reporting, and an
--     ambulance gets sent from a position it left an hour ago.
--
-- Freshness is a question about when the SERVER heard from the unit. That is
-- knowable and cannot be spoofed by a bad clock. Position ordering is a question
-- about the device's own timeline, where recorded_at is the right answer.
-- So: keep recorded_at for ordering, judge freshness on received_at.
--
-- Also clamps timestamps from the future. A device reporting ahead of server
-- time was previously stored as-is, and every later ping from the same device
-- was then discarded by the out-of-order guard (`p_recorded_at <= previous`) —
-- one bad reading could silence a unit until the clock caught up.

-- ---------------------------------------------------------------------------
-- 1. record_unit_location: clamp implausible device clocks
-- ---------------------------------------------------------------------------

create or replace function record_unit_location(
  p_ambulance_id uuid,
  p_lat          double precision,
  p_lng          double precision,
  p_heading      numeric,
  p_speed_kmh    numeric,
  p_accuracy_m   numeric,
  p_recorded_at  timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_point    geography;
  v_prev     ambulance_current_location%rowtype;
  v_moved_m  double precision;
  v_secs     double precision;
  v_request  uuid;
  v_at       timestamptz;
begin
  v_point := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography;

  -- an unusable fix is worse than no fix
  if p_accuracy_m is not null and p_accuracy_m > 50 then
    return false;
  end if;

  -- A device clock ahead of the server is never legitimate. Stored as-is it
  -- would also block every subsequent ping from the same device via the
  -- out-of-order guard below.
  v_at := least(coalesce(p_recorded_at, now()), now());

  select * into v_prev from ambulance_current_location where ambulance_id = p_ambulance_id;

  if found then
    -- out of order arrival after a reconnect: keep the newer reading
    if v_at <= v_prev.recorded_at then
      return false;
    end if;

    v_moved_m := ST_Distance(v_point, v_prev.location);
    v_secs    := extract(epoch from (v_at - v_prev.recorded_at));

    -- stationary drift
    if v_moved_m < 15 then
      return false;
    end if;

    -- physically impossible jump — a glitch, not a vehicle
    if v_secs > 0 and (v_moved_m / v_secs) * 3.6 > 200 then
      return false;
    end if;
  end if;

  select id into v_request from transport_requests
   where assigned_unit_id = p_ambulance_id
     and status in ('matched','en_route_to_patient','on_scene','transporting')
   limit 1;

  insert into ambulance_locations
    (ambulance_id, request_id, location, heading, speed_kmh, accuracy_m, recorded_at)
  values
    (p_ambulance_id, v_request, v_point, p_heading, p_speed_kmh, p_accuracy_m, v_at);

  insert into ambulance_current_location
    (ambulance_id, location, heading, speed_kmh, accuracy_m, recorded_at)
  values
    (p_ambulance_id, v_point, p_heading, p_speed_kmh, p_accuracy_m, v_at)
  on conflict (ambulance_id) do update
    set location = excluded.location, heading = excluded.heading,
        speed_kmh = excluded.speed_kmh, accuracy_m = excluded.accuracy_m,
        recorded_at = excluded.recorded_at, received_at = now();

  return true;
end;
$$;

comment on function record_unit_location(uuid, double precision, double precision, numeric, numeric, numeric, timestamptz) is
  'Records a unit position. Device timestamps from the future are clamped to server now() — stored as-is they also blocked every later ping via the out-of-order guard. NULL p_recorded_at means "now".';

-- ---------------------------------------------------------------------------
-- 2. Dispatch freshness now asks when the SERVER heard from the unit
-- ---------------------------------------------------------------------------
--
-- received_at is stamped by Postgres on write and cannot be moved by a bad
-- device clock. recorded_at keeps its job: ordering, and the physics checks
-- above, which are about the device's own timeline.

drop function if exists find_candidate_units(uuid, integer, integer);

create or replace function find_candidate_units(
  p_request_id uuid,
  p_radius_m   integer default 15000,
  p_limit      integer default 12
)
returns table (
  unit_id              uuid,
  provider_id          uuid,
  provider_type        text,
  provider_hospital_id uuid,
  reliability_score    numeric,
  vehicle_tier         text,
  crew_tier            text,
  capabilities         text[],
  current_lat          double precision,
  current_lng          double precision,
  straight_line_m      double precision,
  shift_ends_at        timestamptz,
  last_dispatched_at   timestamptz,
  location_age_seconds integer
)
language sql
stable
security definer
set search_path = public
as $$
  with req as (
    select r.id, r.pickup_point, r.required_tier, r.required_capabilities, r.destination_hospital_id,
           coalesce(r.scheduled_for, now()) as reference_time
      from transport_requests r
     where r.id = p_request_id
  ),
  live as (
    select a.id as unit_id, a.provider_id, a.vehicle_tier, a.capabilities,
           p.provider_type, p.hospital_id as provider_hospital_id, p.reliability_score,
           loc.location, s.crew_tier, s.ends_at as shift_ends_at,
           extract(epoch from (now() - loc.received_at))::int as location_age_seconds
      from ambulances a
      join ambulance_providers p           on p.id = a.provider_id
      join ambulance_current_location loc  on loc.ambulance_id = a.id
      join ambulance_shifts s              on s.ambulance_id = a.id
      left join hospitals h                on h.id = p.hospital_id
      cross join req
     where a.is_active
       and p.is_active
       and a.status = 'available'
       and req.reference_time between s.starts_at and s.ends_at
       -- Server-stamped, so a crew phone with a slow clock stays dispatchable
       -- and one with a fast clock cannot fake being live.
       and loc.received_at > now() - make_interval(secs => unit_location_max_age_seconds())
       -- effective radius: a hospital-owned fleet may cap how far it travels
       and ST_DWithin(loc.location, req.pickup_point, least(p_radius_m, coalesce(h.ambulance_service_radius_m, p_radius_m)))
       -- effective care level is the lower of vehicle and crew
       and least(tier_rank(a.vehicle_tier), tier_rank(s.crew_tier))
             >= tier_rank(req.required_tier)
       and a.capabilities @> req.required_capabilities
       -- provider service area, when one is defined
       and (p.service_area is null or ST_Covers(p.service_area, req.pickup_point))
       -- a private fleet only serves its own hospital's requests once a destination is chosen
       and (h.id is null or h.ambulance_private_fleet is not true
            or req.destination_hospital_id is null or req.destination_hospital_id = p.hospital_id)
       -- a hospital fleet that isn't 24/7 only dispatches within its own operating hours
       and (h.id is null or h.ambulance_service_hours_247 or is_hospital_open_now(h.id))
       -- no active job
       and not exists (
         select 1 from transport_requests t
          where t.assigned_unit_id = a.id
            and t.status in ('matched','en_route_to_patient','on_scene',
                             'transporting','arrived_at_destination')
       )
       -- no live offer pending on this unit for a different request
       and not exists (
         select 1 from dispatch_offers o
          where o.ambulance_id = a.id
            and o.response = 'pending'
            and o.expires_at > now()
            and o.request_id <> p_request_id
       )
       -- no imminent scheduled job this one would run into
       and not exists (
         select 1 from transport_requests t
          where t.assigned_unit_id = a.id
            and t.status = 'scheduled'
            and t.scheduled_for between req.reference_time
                                    and req.reference_time + interval '2 hours'
       )
  )
  select live.unit_id, live.provider_id, live.provider_type, live.provider_hospital_id,
         live.reliability_score, live.vehicle_tier, live.crew_tier, live.capabilities,
         ST_Y(live.location::geometry), ST_X(live.location::geometry),
         ST_Distance(live.location, req.pickup_point),
         live.shift_ends_at,
         (select max(t.matched_at) from transport_requests t
           where t.assigned_unit_id = live.unit_id),
         live.location_age_seconds
    from live cross join req
   order by ST_Distance(live.location, req.pickup_point)
   limit p_limit;
$$;

revoke all on function find_candidate_units(uuid, integer, integer) from public, anon, authenticated;
grant execute on function find_candidate_units(uuid, integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 3. The probe and the crew's own duty view follow the same clock
-- ---------------------------------------------------------------------------

create or replace function dispatch_supply_probe(
  p_request_id uuid,
  p_radius_m   integer default 15000
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with req as (
    select r.id, r.pickup_point, r.required_tier, r.required_capabilities,
           coalesce(r.scheduled_for, now()) as reference_time
      from transport_requests r where r.id = p_request_id
  )
  select jsonb_build_object(
    'units_total',        (select count(*) from ambulances),
    'units_active',       (select count(*) from ambulances a join ambulance_providers p on p.id = a.provider_id
                            where a.is_active and p.is_active),
    'units_free',         (select count(*) from ambulances a join ambulance_providers p on p.id = a.provider_id
                            where a.is_active and p.is_active and a.status = 'available'),
    'units_on_shift',     (select count(*) from ambulances a
                             join ambulance_providers p on p.id = a.provider_id
                             join ambulance_shifts s on s.ambulance_id = a.id
                             cross join req
                            where a.is_active and p.is_active and a.status = 'available'
                              and req.reference_time between s.starts_at and s.ends_at),
    'units_with_recent_fix', (select count(*) from ambulances a
                                join ambulance_providers p on p.id = a.provider_id
                                join ambulance_shifts s on s.ambulance_id = a.id
                                join ambulance_current_location loc on loc.ambulance_id = a.id
                                cross join req
                               where a.is_active and p.is_active and a.status = 'available'
                                 and req.reference_time between s.starts_at and s.ends_at
                                 and loc.received_at > now() - make_interval(secs => unit_location_max_age_seconds())),
    'units_in_radius',    (select count(*) from ambulances a
                             join ambulance_providers p on p.id = a.provider_id
                             join ambulance_shifts s on s.ambulance_id = a.id
                             join ambulance_current_location loc on loc.ambulance_id = a.id
                             cross join req
                            where a.is_active and p.is_active and a.status = 'available'
                              and req.reference_time between s.starts_at and s.ends_at
                              and loc.received_at > now() - make_interval(secs => unit_location_max_age_seconds())
                              and ST_DWithin(loc.location, req.pickup_point, p_radius_m)),
    'freshest_fix_seconds', (select min(extract(epoch from (now() - loc.received_at))::int)
                               from ambulance_current_location loc),
    -- Surfaces the failure mode this migration exists for: a large positive
    -- number here means devices are reporting timestamps well behind server
    -- time, i.e. somebody's clock is wrong.
    'max_device_clock_skew_seconds', (select max(extract(epoch from (loc.received_at - loc.recorded_at))::int)
                                        from ambulance_current_location loc),
    'radius_m',           p_radius_m
  );
$$;

revoke all on function dispatch_supply_probe(uuid, integer) from public, anon, authenticated;
grant execute on function dispatch_supply_probe(uuid, integer) to service_role;

-- check_ambulance_coverage judges the same way, or the alarm and the dispatcher
-- would disagree about whether anyone is available.
create or replace function check_ambulance_coverage()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dispatchable integer;
  v_on_shift     integer;
  v_open_alert   uuid;
  v_raised       integer := 0;
begin
  select count(*) into v_on_shift
    from ambulances a
    join ambulance_providers p on p.id = a.provider_id
    join ambulance_shifts s    on s.ambulance_id = a.id
   where a.is_active and p.is_active
     and now() between s.starts_at and s.ends_at;

  select count(*) into v_dispatchable
    from ambulances a
    join ambulance_providers p on p.id = a.provider_id
    join ambulance_shifts s    on s.ambulance_id = a.id
    join ambulance_current_location loc on loc.ambulance_id = a.id
   where a.is_active and p.is_active
     and a.status = 'available'
     and now() between s.starts_at and s.ends_at
     and loc.received_at > now() - make_interval(secs => unit_location_max_age_seconds());

  select id into v_open_alert
    from dispatcher_alerts
   where kind = 'no_coverage'
     and acknowledged_at is null
   order by created_at desc
   limit 1;

  if v_dispatchable = 0 and v_open_alert is null then
    insert into dispatcher_alerts (request_id, severity, kind, message)
    values (
      null, 'critical', 'no_coverage',
      format('NO DISPATCHABLE AMBULANCE on the whole network. %s unit(s) on shift, %s reporting a usable position. Any emergency request right now will fail.',
             v_on_shift, v_dispatchable)
    );
    v_raised := 1;
  end if;

  return v_raised;
end;
$$;

revoke all on function check_ambulance_coverage() from public, anon, authenticated;
