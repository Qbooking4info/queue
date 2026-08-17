-- Queue — two-way live location for ambulance transport
--
-- Today the location flow is one-directional and only half-live:
--
--   * The patient sees the assigned unit move (ambulance_current_location +
--     the "Participants can read live unit position" policy) once a request is
--     matched, and nothing at all before that.
--   * The crew never sees the patient. get_my_active_job() hands them the
--     pickup point captured at booking, which is a static pin — if the caller
--     was moved, walked out to the road, or gave the location from indoors,
--     the crew is driving to where the patient was, not where they are.
--   * ETA is stamped once at dispatch and never revised.
--
-- This migration adds the two missing halves:
--
--   1. A live patient position for an active job, readable only by the crew on
--      that job (and the patient themselves), so the crew can drive to a moving
--      target and see it move.
--   2. A pre-booking view of nearby available units, so someone opening the
--      emergency flow can see that help actually exists near them before they
--      commit — deliberately coarse, and deliberately not the reverse: crew are
--      shown nothing about people who have not booked.

-- ---------------------------------------------------------------------------
-- 1. Live patient position during an active job
-- ---------------------------------------------------------------------------

create table if not exists transport_patient_location (
  request_id   uuid primary key references transport_requests(id) on delete cascade,
  location     geography(Point, 4326) not null,
  accuracy_m   numeric(7,2),
  recorded_at  timestamptz not null,
  received_at  timestamptz not null default now()
);

create index if not exists transport_patient_location_geo_idx
  on transport_patient_location using gist (location);

comment on table transport_patient_location is
  'The requester''s live position while their transport request is active. One row per request, overwritten in place — this is a "where are they now" table, not a history. Written only through record_patient_location(); readable only by the requester and the crew on that job.';

alter table transport_patient_location enable row level security;

-- The patient owns their own row, and the crew assigned to the job can read it.
-- Nobody else — this is a person's live position, and the only justification
-- for anyone seeing it is that they are currently driving to collect them.
drop policy if exists "Participants can read live patient position" on transport_patient_location;
create policy "Participants can read live patient position" on transport_patient_location
  for select using (
    request_id in (
      select r.id from transport_requests r
       where r.status in ('matched','en_route_to_patient','on_scene','transporting')
         and (
           -- the patient themselves
           r.requester_id = (select id from users where auth_id = auth.uid())
           -- or the crew currently on shift for the assigned unit, via either
           -- crew identity path (see 20260730000001)
           or r.assigned_unit_id in (
             select s.ambulance_id
               from ambulance_shifts s
               join ambulance_shift_crew sc on sc.shift_id = s.id
              where now() between s.starts_at and s.ends_at
                and (
                  sc.crew_member_id in (
                    select c.id from ambulance_crew c
                     where c.user_id = (select id from users where auth_id = auth.uid())
                       and c.is_active
                  )
                  or sc.hospital_admin_id in (
                    select ha.id from hospital_admins ha
                     where ha.user_id = (select id from users where auth_id = auth.uid())
                       and ha.is_active and ha.role = 'ambulance_crew'
                  )
                )
           )
         )
    )
  );

-- ---------------------------------------------------------------------------
-- 2. record_patient_location — the only writer
-- ---------------------------------------------------------------------------
--
-- Mirrors record_unit_location's shape and its filters: a fix too inaccurate to
-- act on, or one that arrives out of order after a reconnect, is discarded
-- rather than stored. The stationary-drift filter is looser here (10m vs 15m)
-- because a patient on foot moves slower than a vehicle and the crew still
-- wants to see them cross a road.
--
-- Stops accepting writes as soon as the job reaches a terminal state. Location
-- sharing that outlives its reason is surveillance, so the window closes on its
-- own rather than depending on the app remembering to stop.

create or replace function record_patient_location(
  p_request_id  uuid,
  p_lat         double precision,
  p_lng         double precision,
  p_accuracy_m  numeric default null,
  p_recorded_at timestamptz default now()
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_point geography;
  v_prev  transport_patient_location%rowtype;
  v_ok    boolean;
begin
  select true into v_ok
    from transport_requests r
   where r.id = p_request_id
     and r.requester_id = (select id from users where auth_id = auth.uid())
     and r.status in ('matched','en_route_to_patient','on_scene','transporting');

  if not found then
    return false;   -- not your request, or the job is over
  end if;

  if p_accuracy_m is not null and p_accuracy_m > 100 then
    return false;   -- an unusable fix is worse than no fix
  end if;

  v_point := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography;

  select * into v_prev from transport_patient_location where request_id = p_request_id;

  if found then
    if p_recorded_at <= v_prev.recorded_at then
      return false;                                    -- out-of-order arrival
    end if;
    if ST_Distance(v_point, v_prev.location) < 10 then
      return false;                                    -- stationary drift
    end if;
  end if;

  insert into transport_patient_location (request_id, location, accuracy_m, recorded_at)
  values (p_request_id, v_point, p_accuracy_m, p_recorded_at)
  on conflict (request_id) do update
    set location = excluded.location, accuracy_m = excluded.accuracy_m,
        recorded_at = excluded.recorded_at, received_at = now();

  return true;
end;
$$;

comment on function record_patient_location(uuid, double precision, double precision, numeric, timestamptz) is
  'Upserts the requester''s live position for an active transport request. Refuses writes from anyone but the requester and stops accepting them once the job ends.';

revoke all on function record_patient_location(uuid, double precision, double precision, numeric, timestamptz) from public, anon;
grant execute on function record_patient_location(uuid, double precision, double precision, numeric, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. get_job_patient_location — what the crew reads
-- ---------------------------------------------------------------------------
--
-- The RLS policy above already permits this read, but crew reach the rest of
-- their job data through SECURITY DEFINER RPCs (get_my_active_job and friends)
-- because their tables have no self-read policies. Keeping this one consistent
-- means one authorization story for the crew app instead of two.

create or replace function get_job_patient_location(p_request_id uuid)
returns table (
  lat         double precision,
  lng         double precision,
  accuracy_m  numeric,
  recorded_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select ST_Y(l.location::geometry), ST_X(l.location::geometry), l.accuracy_m, l.recorded_at
    from transport_patient_location l
    join transport_requests r on r.id = l.request_id
   where l.request_id = p_request_id
     and r.status in ('matched','en_route_to_patient','on_scene','transporting')
     and (
       r.requester_id = (select id from users where auth_id = auth.uid())
       or r.assigned_unit_id in (
         select s.ambulance_id
           from ambulance_shifts s
           join ambulance_shift_crew sc on sc.shift_id = s.id
          where now() between s.starts_at and s.ends_at
            and (
              sc.crew_member_id in (
                select c.id from ambulance_crew c
                 where c.user_id = (select id from users where auth_id = auth.uid()) and c.is_active
              )
              or sc.hospital_admin_id in (
                select ha.id from hospital_admins ha
                 where ha.user_id = (select id from users where auth_id = auth.uid())
                   and ha.is_active and ha.role = 'ambulance_crew'
              )
            )
       )
     );
$$;

revoke all on function get_job_patient_location(uuid) from public, anon;
grant execute on function get_job_patient_location(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. nearby_available_units — the pre-booking view
-- ---------------------------------------------------------------------------
--
-- What someone sees when they open the emergency flow: are there ambulances
-- near me, and how near. Uses exactly the same liveness test as dispatch
-- (`visible_to_dispatch` in get_my_units) so the map cannot promise a unit the
-- matcher would not actually consider — a rig shown on the map that dispatch
-- has already written off is worse than an empty map.
--
-- What it deliberately does NOT return: plate number, call sign, provider,
-- crew, or the unit id. Before a booking exists the patient has no relationship
-- with any particular vehicle, and an addressable id turns this into a way to
-- follow a named ambulance around the city. Positions are rounded to ~11m,
-- which is well inside what a map at this zoom can show and outside what is
-- useful for tailing someone.
--
-- The reverse — crew seeing people who have not booked — is not provided, on
-- purpose. There is no pairing yet to justify it.

create or replace function nearby_available_units(
  p_lat      double precision,
  p_lng      double precision,
  p_radius_m integer default 15000,
  p_limit    integer default 12
)
returns table (
  lat        double precision,
  lng        double precision,
  tier       text,
  distance_m double precision
)
language sql
stable
security definer
set search_path = public
as $$
  select round(ST_Y(loc.location::geometry)::numeric, 4)::double precision,
         round(ST_X(loc.location::geometry)::numeric, 4)::double precision,
         a.vehicle_tier,
         round(ST_Distance(loc.location, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography)::numeric, 0)::double precision
    from ambulance_current_location loc
    join ambulances a          on a.id = loc.ambulance_id
    join ambulance_providers p on p.id = a.provider_id
   where a.is_active
     and p.is_active
     and a.status = 'available'
     and loc.recorded_at > now() - make_interval(secs => unit_location_ttl_seconds())
     and exists (
       select 1 from ambulance_shifts s
        where s.ambulance_id = a.id and now() between s.starts_at and s.ends_at
     )
     and ST_DWithin(loc.location, ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography, least(p_radius_m, 50000))
   order by 4
   limit least(p_limit, 50);
$$;

comment on function nearby_available_units(double precision, double precision, integer, integer) is
  'Coarse positions of dispatchable units near a point, for the pre-booking map. Returns no identifying detail and no unit id on purpose — before a booking there is no relationship with a particular vehicle.';

revoke all on function nearby_available_units(double precision, double precision, integer, integer) from public;
grant execute on function nearby_available_units(double precision, double precision, integer, integer) to authenticated, anon;

-- ---------------------------------------------------------------------------
-- 5. Realtime
-- ---------------------------------------------------------------------------
-- The crew's map subscribes to the patient's position the same way the
-- patient's map already subscribes to the unit's.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table transport_patient_location;
    exception when duplicate_object then null;
    end;
  end if;
end $$;

alter table transport_patient_location replica identity full;
