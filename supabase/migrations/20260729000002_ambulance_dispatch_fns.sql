-- Queue — ambulance services: dispatch functions
--
-- Cheap index backed filtering happens here in Postgres. Scoring happens in
-- TypeScript because it needs road ETAs from the routing provider.

-- ---------------------------------------------------------------------------
-- Candidate selection
--
-- Ordered by straight line distance so the caller can cap how many road ETAs it
-- requests — routing matrix calls are the expensive part of a dispatch round.
-- ---------------------------------------------------------------------------

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
  last_dispatched_at   timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with req as (
    select r.id, r.pickup_point, r.required_tier, r.required_capabilities,
           coalesce(r.scheduled_for, now()) as reference_time
      from transport_requests r
     where r.id = p_request_id
  ),
  live as (
    select a.id as unit_id, a.provider_id, a.vehicle_tier, a.capabilities,
           p.provider_type, p.hospital_id as provider_hospital_id, p.reliability_score,
           loc.location, s.crew_tier, s.ends_at as shift_ends_at
      from ambulances a
      join ambulance_providers p           on p.id = a.provider_id
      join ambulance_current_location loc  on loc.ambulance_id = a.id
      join ambulance_shifts s              on s.ambulance_id = a.id
      cross join req
     where a.is_active
       and p.is_active
       and a.status = 'available'
       and req.reference_time between s.starts_at and s.ends_at
       -- a stale position is not a usable position
       and loc.recorded_at > now() - interval '2 minutes'
       and ST_DWithin(loc.location, req.pickup_point, p_radius_m)
       -- effective care level is the lower of vehicle and crew
       and least(tier_rank(a.vehicle_tier), tier_rank(s.crew_tier))
             >= tier_rank(req.required_tier)
       and a.capabilities @> req.required_capabilities
       -- provider service area, when one is defined
       and (p.service_area is null or ST_Covers(p.service_area, req.pickup_point))
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
           where t.assigned_unit_id = live.unit_id)
    from live cross join req
   order by ST_Distance(live.location, req.pickup_point)
   limit p_limit;
$$;

-- ---------------------------------------------------------------------------
-- Pickup coordinates, for handing to the routing provider
-- ---------------------------------------------------------------------------

create or replace function get_request_pickup_latlng(p_request_id uuid)
returns table (lat double precision, lng double precision)
language sql
stable
security definer
set search_path = public
as $$
  select ST_Y(pickup_point::geometry), ST_X(pickup_point::geometry)
    from transport_requests where id = p_request_id;
$$;

-- ---------------------------------------------------------------------------
-- Destination ranking
--
-- Uses the existing hospitals.latitude/longitude columns — this function is the
-- only place the two coordinate representations meet, so the rest of the system
-- never has to care that hospitals are not PostGIS.
--
-- hospital_clinics.is_emergency is the ER filter, already in your schema.
-- ---------------------------------------------------------------------------

create or replace function rank_destination_hospitals(
  p_request_id uuid,
  p_radius_m   integer default 25000,
  p_limit      integer default 5
)
returns table (
  hospital_id     uuid,
  hospital_name   text,
  clinic_id       uuid,
  distance_m      double precision,
  is_24_hours     boolean,
  has_prior_care  boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with req as (
    select r.id, r.pickup_point, r.patient_id from transport_requests r where r.id = p_request_id
  )
  select h.id,
         h.name,
         (select c.id from hospital_clinics c
           where c.hospital_id = h.id and c.is_emergency limit 1),
         ST_Distance(
           ST_SetSRID(ST_MakePoint(h.longitude, h.latitude), 4326)::geography,
           req.pickup_point
         ),
         coalesce(h.emergency_hours, false),
         exists (
           select 1 from appointments ap
            where ap.hospital_id = h.id
              and ap.patient_id = req.patient_id
              and ap.status = 'completed'
         )
    from hospitals h
    cross join req
   where h.is_active
     and h.latitude is not null
     and h.longitude is not null
     and exists (
       select 1 from hospital_clinics c where c.hospital_id = h.id and c.is_emergency
     )
     and ST_DWithin(
           ST_SetSRID(ST_MakePoint(h.longitude, h.latitude), 4326)::geography,
           req.pickup_point,
           p_radius_m
         )
   order by coalesce(h.emergency_hours, false) desc,
            ST_Distance(
              ST_SetSRID(ST_MakePoint(h.longitude, h.latitude), 4326)::geography,
              req.pickup_point
            )
   limit p_limit;
$$;

-- ---------------------------------------------------------------------------
-- Atomic accept — this is where the broadcast race is resolved.
--
-- Returns true only for the crew that actually won. Everyone else gets false
-- and should see "already covered", not an error.
-- ---------------------------------------------------------------------------

create or replace function accept_dispatch_offer(
  p_offer_id uuid,
  p_auth_id  uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id uuid;
  v_unit_id    uuid;
  v_user_id    uuid;
  v_updated    integer;
begin
  select id into v_user_id from users where auth_id = p_auth_id;

  select o.request_id, o.ambulance_id
    into v_request_id, v_unit_id
    from dispatch_offers o
   where o.id = p_offer_id
     and o.response = 'pending'
     and o.expires_at > now()
     for update;

  if not found then
    return false;
  end if;

  -- The guard is `status = 'searching'`. Concurrent callers serialize on the
  -- row and only the first one sees 'searching'.
  update transport_requests
     set status = 'matched', assigned_unit_id = v_unit_id, matched_at = now(), updated_at = now()
   where id = v_request_id and status = 'searching';

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    update dispatch_offers set response = 'expired', responded_at = now()
     where id = p_offer_id;
    return false;
  end if;

  update dispatch_offers set response = 'accepted', responded_at = now()
   where id = p_offer_id;

  -- withdraw sibling offers from this broadcast round
  update dispatch_offers set response = 'expired', responded_at = now()
   where request_id = v_request_id and id <> p_offer_id and response = 'pending';

  update ambulances set status = 'assigned', updated_at = now() where id = v_unit_id;

  update transport_events
     set actor_id = v_user_id, actor_role = 'crew'
   where request_id = v_request_id
     and to_status = 'matched'
     and actor_id is null;

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Location ingest — validated in one place so every client gets the same rules
--
-- Rejects GPS drift and impossible jumps. Without this a parked ambulance
-- appears to wander around the block on the patient's live map.
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
begin
  v_point := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography;

  -- an unusable fix is worse than no fix
  if p_accuracy_m is not null and p_accuracy_m > 50 then
    return false;
  end if;

  select * into v_prev from ambulance_current_location where ambulance_id = p_ambulance_id;

  if found then
    -- out of order arrival after a reconnect: keep the newer reading
    if p_recorded_at <= v_prev.recorded_at then
      return false;
    end if;

    v_moved_m := ST_Distance(v_point, v_prev.location);
    v_secs    := extract(epoch from (p_recorded_at - v_prev.recorded_at));

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
    (p_ambulance_id, v_request, v_point, p_heading, p_speed_kmh, p_accuracy_m, p_recorded_at);

  insert into ambulance_current_location
    (ambulance_id, location, heading, speed_kmh, accuracy_m, recorded_at)
  values
    (p_ambulance_id, v_point, p_heading, p_speed_kmh, p_accuracy_m, p_recorded_at)
  on conflict (ambulance_id) do update
    set location = excluded.location, heading = excluded.heading,
        speed_kmh = excluded.speed_kmh, accuracy_m = excluded.accuracy_m,
        recorded_at = excluded.recorded_at, received_at = now();

  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Sweepers — schedule both via pg_cron
-- ---------------------------------------------------------------------------

create or replace function expire_stale_offers()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  update dispatch_offers set response = 'expired', responded_at = now()
   where response = 'pending' and expires_at <= now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Flags jobs where the crew device has gone quiet. Showing the patient a
-- confidently wrong stale position is worse than showing them nothing.
create or replace function flag_stale_tracking()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer := 0;
begin
  insert into dispatcher_alerts (request_id, severity, kind, message)
  select t.id,
         case when t.triage_level <= 2 then 'critical' else 'high' end,
         'tracking_stale',
         'No position update in over 90 seconds during an active transport.'
    from transport_requests t
    join ambulance_current_location l on l.ambulance_id = t.assigned_unit_id
   where t.status in ('en_route_to_patient','transporting')
     and l.recorded_at < now() - interval '90 seconds'
     and not exists (
       select 1 from dispatcher_alerts a
        where a.request_id = t.id and a.kind = 'tracking_stale'
          and a.created_at > now() - interval '5 minutes'
     );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Sub-minute cron schedules require pg_cron 1.4+ with the seconds syntax
-- below. Verify this Postgres/pg_cron version supports it before relying on
-- it in production — if not, fall back to the standard 5-field '* * * * *'
-- (once a minute) for both, which is still safe: expire_stale_offers() is
-- idempotent, and a 1 minute worst case on a 30s offer TTL only delays the
-- next broadcast round by tens of seconds, not indefinitely.
-- select cron.schedule('expire-offers',  '*/10 * * * * *', 'select expire_stale_offers()');
-- select cron.schedule('stale-tracking', '*/30 * * * * *', 'select flag_stale_tracking()');
