-- Queue — hospital-owned ambulance crew + fleet self-service
--
-- Hospital-fleet crew become hospital staff: a new hospital_admins.role value
-- ('ambulance_crew'), scoped by hospital_admins.hospital_id directly, signing
-- in and being permissioned through the exact same path as front_desk/admin.
-- Third-party (marketplace) crew are untouched — they aren't hospital staff,
-- so they keep the existing ambulance_crew(user_id, provider_id) identity path.
--
-- This migration:
--   1. Extends hospital_admins with the new role + crew_role/crew_tier columns
--   2. Makes ambulance_shift_crew reference EITHER identity path
--   3. Adds three hospital-level ambulance operating settings
--   4. Updates RLS policies and RPCs to recognize both crew identity paths
--   5. Adds private-fleet / radius-cap / operating-hours enforcement to
--      find_candidate_units()

-- ---------------------------------------------------------------------------
-- 1. hospital_admins: new role + crew-specific columns
-- ---------------------------------------------------------------------------

alter table hospital_admins drop constraint if exists hospital_admins_role_check;
alter table hospital_admins add constraint hospital_admins_role_check
  check (role in ('admin', 'owner', 'specialist', 'front_desk', 'ambulance_crew'));

alter table hospital_admins add column if not exists crew_role text;
alter table hospital_admins add column if not exists crew_tier text;

alter table hospital_admins drop constraint if exists hospital_admins_crew_role_check;
alter table hospital_admins add constraint hospital_admins_crew_role_check
  check (crew_role is null or crew_role in ('driver','emt','paramedic','nurse','doctor','dispatcher'));

alter table hospital_admins drop constraint if exists hospital_admins_crew_tier_check;
alter table hospital_admins add constraint hospital_admins_crew_tier_check
  check (crew_tier is null or tier_rank(crew_tier) >= 0);

-- ---------------------------------------------------------------------------
-- 2. ambulance_shift_crew: dual identity (third-party crew OR hospital staff)
-- ---------------------------------------------------------------------------

alter table ambulance_shift_crew drop constraint if exists ambulance_shift_crew_pkey;
alter table ambulance_shift_crew alter column crew_member_id drop not null;
alter table ambulance_shift_crew add column if not exists hospital_admin_id uuid references hospital_admins(id) on delete restrict;
alter table ambulance_shift_crew add column if not exists id uuid default gen_random_uuid();

update ambulance_shift_crew set id = gen_random_uuid() where id is null;
alter table ambulance_shift_crew alter column id set not null;
alter table ambulance_shift_crew add constraint ambulance_shift_crew_pkey primary key (id);

alter table ambulance_shift_crew drop constraint if exists exactly_one_crew_identity;
alter table ambulance_shift_crew add constraint exactly_one_crew_identity
  check ((crew_member_id is not null) <> (hospital_admin_id is not null));

alter table ambulance_shift_crew drop constraint if exists ambulance_shift_crew_identity_unique;
alter table ambulance_shift_crew add constraint ambulance_shift_crew_identity_unique
  unique nulls not distinct (shift_id, crew_member_id, hospital_admin_id);

create index if not exists ambulance_shift_crew_hospital_admin_idx on ambulance_shift_crew (hospital_admin_id) where hospital_admin_id is not null;

-- ---------------------------------------------------------------------------
-- 3. hospitals: ambulance operating settings, same convention as
--    is_24_hours/emergency_hours (plain typed columns, no JSONB blob).
-- ---------------------------------------------------------------------------

alter table hospitals add column if not exists ambulance_private_fleet boolean not null default true;
alter table hospitals add column if not exists ambulance_service_radius_m integer;
alter table hospitals add column if not exists ambulance_service_hours_247 boolean not null default true;

-- ---------------------------------------------------------------------------
-- 4. RLS: crew read policies now recognize the hospital_admin_id path too
-- ---------------------------------------------------------------------------

drop policy if exists "Crew can read active assigned job" on transport_requests;
create policy "Crew can read active assigned job" on transport_requests
  for select using (
    status in ('matched','en_route_to_patient','on_scene','transporting','arrived_at_destination')
    and assigned_unit_id in (
      select s.ambulance_id
        from ambulance_shifts s
        join ambulance_shift_crew sc on sc.shift_id = s.id
       where now() between s.starts_at and s.ends_at
         and (
           sc.crew_member_id in (
             select c.id from ambulance_crew c
              join users u on u.id = c.user_id
             where u.auth_id = auth.uid() and c.is_active
           )
           or sc.hospital_admin_id in (
             select ha.id from hospital_admins ha
               join users u on u.id = ha.user_id
              where u.auth_id = auth.uid()
                and ha.role = 'ambulance_crew' and ha.is_active
           )
         )
    )
  );

drop policy if exists "Crew can read own offers" on dispatch_offers;
create policy "Crew can read own offers" on dispatch_offers
  for select using (
    ambulance_id in (
      select s.ambulance_id
        from ambulance_shifts s
        join ambulance_shift_crew sc on sc.shift_id = s.id
       where now() between s.starts_at and s.ends_at
         and (
           sc.crew_member_id in (
             select c.id from ambulance_crew c
               join users u on u.id = c.user_id
              where u.auth_id = auth.uid() and c.is_active
           )
           or sc.hospital_admin_id in (
             select ha.id from hospital_admins ha
               join users u on u.id = ha.user_id
              where u.auth_id = auth.uid()
                and ha.role = 'ambulance_crew' and ha.is_active
           )
         )
    )
  );

-- ---------------------------------------------------------------------------
-- 5. get_my_staff_profile(): recognize ambulance_crew, expose crew_role/crew_tier
-- ---------------------------------------------------------------------------

drop function if exists get_my_staff_profile();

create or replace function get_my_staff_profile()
returns table(
  staff_role   text,
  hospital_id  uuid,
  clinic_id    uuid,
  crew_role    text,
  crew_tier    text
)
language plpgsql
security definer
stable
as $$
begin
  -- Hospital-level admin / front desk / ambulance crew
  return query
  select ha.role::text, ha.hospital_id, null::uuid, ha.crew_role, ha.crew_tier
  from   hospital_admins ha
  where  ha.user_id = (select id from users where auth_id = auth.uid())
  and    ha.is_active = true
  limit  1;

  if found then return; end if;

  -- Clinic-level admin / front desk / desk_officer
  return query
  select ca.role::text, ca.hospital_id, ca.clinic_id, null::text, null::text
  from   clinic_admins ca
  where  ca.user_id = (select id from users where auth_id = auth.uid())
  and    ca.is_active = true
  limit  1;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Crew RPCs: recognize the hospital_admin_id identity path alongside the
--    existing ambulance_crew.user_id path
-- ---------------------------------------------------------------------------

create or replace function get_my_pending_offers()
returns table (
  offer_id            uuid,
  request_id          uuid,
  ambulance_id        uuid,
  score               numeric,
  eta_seconds         integer,
  expires_at          timestamptz,
  triage_level        smallint,
  symptom_description text,
  pickup_address      text,
  pickup_lat          double precision,
  pickup_lng          double precision
)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, o.request_id, o.ambulance_id, o.score, o.eta_seconds, o.expires_at,
         r.triage_level, r.symptom_description, r.pickup_address,
         ST_Y(r.pickup_point::geometry), ST_X(r.pickup_point::geometry)
    from dispatch_offers o
    join transport_requests r on r.id = o.request_id
   where o.response = 'pending'
     and o.expires_at > now()
     and o.ambulance_id in (
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
                 and ha.role = 'ambulance_crew' and ha.is_active
            )
          )
     )
   order by o.offered_at;
$$;

create or replace function get_my_active_job()
returns table (
  request_id          uuid,
  booking_ref         text,
  status              text,
  assigned_unit_id    uuid,
  triage_level        smallint,
  symptom_description text,
  contact_phone       text,
  pickup_address      text,
  pickup_lat          double precision,
  pickup_lng          double precision,
  destination_hospital_id uuid,
  destination_hospital_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.booking_ref, r.status, r.assigned_unit_id, r.triage_level, r.symptom_description,
         r.contact_phone, r.pickup_address,
         ST_Y(r.pickup_point::geometry), ST_X(r.pickup_point::geometry),
         r.destination_hospital_id, h.name
    from transport_requests r
    left join hospitals h on h.id = r.destination_hospital_id
   where r.status in ('matched','en_route_to_patient','on_scene','transporting','arrived_at_destination')
     and r.assigned_unit_id in (
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
                 and ha.role = 'ambulance_crew' and ha.is_active
            )
          )
     )
   limit 1;
$$;

create or replace function crew_update_job_status(
  p_request_id uuid,
  p_new_status text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unit_id uuid;
  v_updated integer;
begin
  if p_new_status not in ('en_route_to_patient', 'on_scene', 'transporting', 'arrived_at_destination') then
    raise exception 'crew_update_job_status: % is not a crew-drivable status', p_new_status
      using errcode = 'check_violation';
  end if;

  select assigned_unit_id into v_unit_id
    from transport_requests
   where id = p_request_id
     and assigned_unit_id in (
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
                 and ha.role = 'ambulance_crew' and ha.is_active
            )
          )
     );

  if v_unit_id is null then
    return false;
  end if;

  update transport_requests
     set status = p_new_status, updated_at = now()
   where id = p_request_id;

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. is_hospital_open_now(): mirrors mobile's isOpenNow(), for hospital-fleet
--    dispatch-hours enforcement. Nigeria-only app — Africa/Lagos, no DST.
-- ---------------------------------------------------------------------------

create or replace function is_hospital_open_now(p_hospital_id uuid)
returns boolean
language sql
stable
as $$
  select coalesce(bool_or(
    not h.is_closed
    and (now() at time zone 'Africa/Lagos')::time between h.open_time and h.close_time
  ), false)
  from hospital_operating_hours h
  where h.hospital_id = p_hospital_id
    and h.day_of_week = extract(dow from (now() at time zone 'Africa/Lagos'))::int;
$$;

-- ---------------------------------------------------------------------------
-- 8. find_candidate_units(): private fleet / radius cap / operating hours
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
    select r.id, r.pickup_point, r.required_tier, r.required_capabilities, r.destination_hospital_id,
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
      left join hospitals h                on h.id = p.hospital_id
      cross join req
     where a.is_active
       and p.is_active
       and a.status = 'available'
       and req.reference_time between s.starts_at and s.ends_at
       -- a stale position is not a usable position
       and loc.recorded_at > now() - interval '2 minutes'
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
           where t.assigned_unit_id = live.unit_id)
    from live cross join req
   order by ST_Distance(live.location, req.pickup_point)
   limit p_limit;
$$;
