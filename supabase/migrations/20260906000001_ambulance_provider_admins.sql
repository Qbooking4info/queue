-- Queue — standalone ambulance admin identity
--
-- Today an ambulance_providers row can only be created by a hospital_admin
-- (POST /api/ambulances/fleet), and the only person who can manage it is
-- whoever holds that hospital's admin login. There is no identity at all for
-- an independent (private or government) operator who is not part of any
-- hospital — exactly the "Uber/Bolt for ambulances" operator this migration
-- exists for.
--
-- Same shape as hospital_admins / clinic_admins / ambulance_crew: a role link
-- table with RLS enabled and no self-read policy, reached only through a
-- SECURITY DEFINER RPC (get_my_ambulance_admin_profile, mirroring
-- get_my_staff_profile / get_my_crew_profile exactly).

create table if not exists ambulance_provider_admins (
  id          uuid primary key default gen_random_uuid(),
  provider_id uuid not null references ambulance_providers(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  role        text not null default 'owner' check (role in ('owner', 'admin')),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),

  unique (provider_id, user_id)
);

create index if not exists ambulance_provider_admins_user_idx     on ambulance_provider_admins (user_id) where is_active;
create index if not exists ambulance_provider_admins_provider_idx on ambulance_provider_admins (provider_id) where is_active;

alter table ambulance_provider_admins enable row level security;

-- ---------------------------------------------------------------------------
-- "indicate if they are from a hospital or strictly independent" -- the
-- provider_type column already carries that split (hospital_fleet /
-- third_party). What third_party doesn't carry yet is private-vs-government,
-- which only matters for that branch (a hospital_fleet's ownership is the
-- hospital's own `hospitals.ownership` column, already captured there).
-- ---------------------------------------------------------------------------

alter table ambulance_providers
  add column if not exists ownership_category text
    check (ownership_category in ('private', 'government'));

comment on column ambulance_providers.ownership_category is
  'Only meaningful for provider_type=''third_party'' -- private or government-run independent operator.';

-- ---------------------------------------------------------------------------
-- "independent and hospital owned ambulances to work the same, have the same
-- registration process ... ambulance management will be on the ambulance app
-- only" -- a hospital-owned fleet is no longer managed through the hospital's
-- own hospital_admins login; it registers through the same flow an
-- independent operator does (POST /api/ambulances/register) and is managed
-- by its own ambulance_provider_admins account. These per-provider settings
-- replace hospitals.ambulance_private_fleet / ambulance_service_radius_m /
-- ambulance_service_hours_247 (which stay on `hospitals`, now unused by the
-- ambulance feature -- a later cleanup migration can drop them once confirmed
-- nothing else reads them). Only private_fleet is hospital_fleet-specific in
-- meaning ("only send patients to their own hospital, or be flexible");
-- radius/hours apply to any provider.
-- ---------------------------------------------------------------------------

alter table ambulance_providers add column if not exists private_fleet boolean not null default true;
alter table ambulance_providers add column if not exists service_radius_m integer;
alter table ambulance_providers add column if not exists service_hours_247 boolean not null default true;

-- ---------------------------------------------------------------------------
-- Identity resolution, mirroring get_my_staff_profile() / get_my_crew_profile().
-- ---------------------------------------------------------------------------

-- Return shape gained hospital_id since the first version of this migration
-- (whichever ran, if any, before this rewrite) -- drop first, since
-- CREATE OR REPLACE rejects a changed return type.
drop function if exists get_my_ambulance_admin_profile();

create or replace function get_my_ambulance_admin_profile()
returns table (
  provider_id   uuid,
  role          text,
  provider_name text,
  provider_type text,
  hospital_id   uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select apa.provider_id, apa.role, p.name, p.provider_type, p.hospital_id
    from ambulance_provider_admins apa
    join ambulance_providers p on p.id = apa.provider_id
   where apa.user_id = (select id from users where auth_id = auth.uid())
     and apa.is_active
   limit 1;
$$;

revoke all on function get_my_ambulance_admin_profile() from public, anon;
grant execute on function get_my_ambulance_admin_profile() to authenticated;

-- ---------------------------------------------------------------------------
-- Duty-toggle authorization: a provider's own admin/owner (hospital-owned or
-- independent -- both work the same way now) can put a unit on/off duty from
-- the operator console, same as its own crew already can (20260810000003's
-- assert_can_operate_unit). hospital_admins is no longer a path to operating
-- a unit at all -- ambulance management lives in the ambulance app only, on
-- ambulance_provider_admins/ambulance_crew, for every provider regardless of
-- type. That function's return shape gains a third identity slot --
-- return-type changes need drop+create, not create or replace. The
-- hospital_admin_id slot is kept (existing rows / RLS policies from
-- 20260730000001 still reference it for reads) but nothing writes it anymore.
-- ---------------------------------------------------------------------------

drop function if exists assert_can_operate_unit(uuid);

create or replace function assert_can_operate_unit(p_ambulance_id uuid)
returns table (crew_member_id uuid, hospital_admin_id uuid, provider_admin_id uuid, crew_tier text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id     uuid;
  v_provider    ambulance_providers%rowtype;
  v_crew_id     uuid;
  v_crew_tier   text;
  v_pa_id       uuid;
begin
  select id into v_user_id from users where auth_id = auth.uid();
  if v_user_id is null then
    raise exception 'not authenticated' using errcode = 'insufficient_privilege';
  end if;

  select p.* into v_provider
    from ambulances a
    join ambulance_providers p on p.id = a.provider_id
   where a.id = p_ambulance_id and a.is_active and p.is_active;

  if not found then
    raise exception 'unit not found or inactive' using errcode = 'no_data_found';
  end if;

  -- This provider's own crew (driver/EMT/etc), hospital-owned or independent alike.
  select c.id, c.crew_tier into v_crew_id, v_crew_tier
    from ambulance_crew c
   where c.user_id = v_user_id and c.provider_id = v_provider.id and c.is_active
   limit 1;

  if v_crew_id is not null then
    return query select v_crew_id, null::uuid, null::uuid, v_crew_tier;
    return;
  end if;

  -- This provider's own admin/owner, putting a rig on duty from the console.
  -- Defaults to BLS: this is a desk action, not a claim about who is driving.
  select apa.id into v_pa_id
    from ambulance_provider_admins apa
   where apa.user_id = v_user_id
     and apa.provider_id = v_provider.id
     and apa.is_active
   limit 1;

  if v_pa_id is not null then
    return query select null::uuid, null::uuid, v_pa_id, 'BLS';
    return;
  end if;

  raise exception 'you are not authorised to operate this unit'
    using errcode = 'insufficient_privilege';
end;
$$;

revoke all on function assert_can_operate_unit(uuid) from public, anon;
grant execute on function assert_can_operate_unit(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- ambulance_shift_crew: third identity slot alongside crew_member_id /
-- hospital_admin_id, same dual-identity pattern as 20260730000001.
-- ---------------------------------------------------------------------------

alter table ambulance_shift_crew add column if not exists provider_admin_id uuid references ambulance_provider_admins(id) on delete restrict;

alter table ambulance_shift_crew drop constraint if exists exactly_one_crew_identity;
alter table ambulance_shift_crew add constraint exactly_one_crew_identity check (
  (case when crew_member_id    is not null then 1 else 0 end +
   case when hospital_admin_id is not null then 1 else 0 end +
   case when provider_admin_id is not null then 1 else 0 end) = 1
);

alter table ambulance_shift_crew drop constraint if exists ambulance_shift_crew_identity_unique;
alter table ambulance_shift_crew add constraint ambulance_shift_crew_identity_unique
  unique nulls not distinct (shift_id, crew_member_id, hospital_admin_id, provider_admin_id);

create index if not exists ambulance_shift_crew_provider_admin_idx on ambulance_shift_crew (provider_admin_id) where provider_admin_id is not null;

create or replace function set_unit_duty(
  p_ambulance_id uuid,
  p_on_duty      boolean,
  p_crew_tier    text    default null,
  p_hours        numeric default 12
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_identity   record;
  v_status     text;
  v_shift_id   uuid;
  v_tier       text;
  v_ends_at    timestamptz;
  v_active_job uuid;
begin
  select * into v_identity from assert_can_operate_unit(p_ambulance_id);

  if p_hours is null or p_hours <= 0 or p_hours > 24 then
    raise exception 'shift length must be between 0 and 24 hours' using errcode = 'check_violation';
  end if;

  -- Lock the unit so two crew toggling at once can't interleave.
  select status into v_status from ambulances where id = p_ambulance_id for update;

  if v_status = 'out_of_service' then
    raise exception 'unit is out of service' using errcode = 'check_violation';
  end if;

  if p_on_duty then
    v_tier := coalesce(p_crew_tier, v_identity.crew_tier, 'BLS');
    if tier_rank(v_tier) < 0 then
      raise exception 'unknown crew tier: %', v_tier using errcode = 'check_violation';
    end if;

    -- Reuse a shift already covering now rather than inserting one. The
    -- no_overlapping_shifts exclusion constraint would reject a second row, and
    -- a crew re-opening the app mid-shift must not be an error.
    select id, ends_at into v_shift_id, v_ends_at
      from ambulance_shifts
     where ambulance_id = p_ambulance_id
       and starts_at <= now() and ends_at > now()
     limit 1;

    if v_shift_id is null then
      insert into ambulance_shifts (ambulance_id, crew_tier, starts_at, ends_at)
      values (p_ambulance_id, v_tier, now(), now() + make_interval(mins => (p_hours * 60)::int))
      returning id, ends_at into v_shift_id, v_ends_at;
    end if;

    -- Attach this person to the shift. Dual identity: exactly one column is set,
    -- enforced by exactly_one_crew_identity.
    insert into ambulance_shift_crew (shift_id, crew_member_id, hospital_admin_id, provider_admin_id)
    values (v_shift_id, v_identity.crew_member_id, v_identity.hospital_admin_id, v_identity.provider_admin_id)
    on conflict do nothing;

    -- Only promote from 'offline'. A unit already 'assigned' or 'busy' is
    -- mid-job; forcing it back to 'available' would offer a rig that is already
    -- carrying a patient.
    if v_status = 'offline' then
      update ambulances set status = 'available', updated_at = now() where id = p_ambulance_id;
      v_status := 'available';
    end if;

  else
    -- Refuse to go offline mid-job. The crew can still complete or hand over the
    -- job; what they cannot do is silently vanish from a patient who is waiting
    -- on them.
    select id into v_active_job
      from transport_requests
     where assigned_unit_id = p_ambulance_id
       and status in ('matched', 'en_route_to_patient', 'on_scene', 'transporting')
     limit 1;

    if v_active_job is not null then
      raise exception 'finish or hand over the active job before going off duty'
        using errcode = 'check_violation';
    end if;

    -- End the covering shift now. greatest() keeps shift_ends_after_start valid
    -- when a crew toggles off within the same instant they toggled on.
    update ambulance_shifts
       set ends_at = greatest(starts_at + interval '1 second', now())
     where ambulance_id = p_ambulance_id
       and starts_at <= now() and ends_at > now()
    returning id into v_shift_id;

    if v_status = 'available' then
      update ambulances set status = 'offline', updated_at = now() where id = p_ambulance_id;
      v_status := 'offline';
    end if;
    v_ends_at := null;
  end if;

  return jsonb_build_object(
    'ambulance_id', p_ambulance_id,
    'status',       v_status,
    'on_duty',      p_on_duty and v_status = 'available',
    'shift_id',     v_shift_id,
    'shift_ends_at', v_ends_at
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- get_my_units(): a provider's own crew or admin/owner sees its fleet
-- directly -- hospital-owned and independent providers work identically here
-- now, both keyed on provider_id, no hospital_admins path at all.
--
-- Also returns each unit's home base (home_lat/home_lng) alongside its live
-- position -- "for testing sake, i can register and add ambulance with
-- address only": a freshly added unit has a home base (geocoded at creation)
-- but no live GPS ping yet, so the Fleet Map falls back to showing it there,
-- clearly labelled as a home base rather than a live fix, the same honest
-- fallback pattern JobPatientMap already uses for a patient's booked pickup
-- point vs their live position.
-- ---------------------------------------------------------------------------

-- Return shape gained home_lat/home_lng since the first version of this
-- migration -- drop first, same reason as get_my_ambulance_admin_profile above.
drop function if exists get_my_units();

create or replace function get_my_units()
returns table (
  ambulance_id        uuid,
  plate_number        text,
  call_sign           text,
  vehicle_tier        text,
  capabilities        text[],
  status              text,
  provider_id         uuid,
  provider_name       text,
  on_duty             boolean,
  shift_ends_at       timestamptz,
  last_ping_at        timestamptz,
  seconds_since_ping  integer,
  visible_to_dispatch boolean,
  home_lat            double precision,
  home_lng            double precision
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select id as user_id from users where auth_id = auth.uid()
  ),
  mine as (
    -- This provider's own crew (driver/EMT/etc)
    select a.id
      from ambulances a
      join ambulance_crew c on c.provider_id = a.provider_id
      cross join me
     where c.user_id = me.user_id and c.is_active and a.is_active
    union
    -- This provider's own admin/owner -- hospital-owned or independent alike
    select a.id
      from ambulances a
      join ambulance_provider_admins apa on apa.provider_id = a.provider_id
      cross join me
     where apa.user_id = me.user_id and apa.is_active and a.is_active
  )
  select a.id, a.plate_number, a.call_sign, a.vehicle_tier, a.capabilities, a.status,
         p.id, p.name,
         (s.id is not null)                                          as on_duty,
         s.ends_at,
         loc.recorded_at,
         case when loc.recorded_at is null then null
              else extract(epoch from (now() - loc.recorded_at))::int end,
         (a.status = 'available'
           and s.id is not null
           and loc.recorded_at is not null
           and loc.recorded_at > now() - make_interval(secs => unit_location_ttl_seconds())),
         ST_Y(a.home_base::geometry), ST_X(a.home_base::geometry)
    from mine
    join ambulances a            on a.id = mine.id
    join ambulance_providers p   on p.id = a.provider_id
    left join ambulance_shifts s on s.ambulance_id = a.id
                                and s.starts_at <= now() and s.ends_at > now()
    left join ambulance_current_location loc on loc.ambulance_id = a.id
   order by a.call_sign nulls last, a.plate_number;
$$;

-- ---------------------------------------------------------------------------
-- "the admin manages his fleets and can see their activities and locations" --
-- a fleet operator watching their WHOLE fleet's live position is a new read
-- pattern; ambulance_current_location's only existing SELECT policy scopes to
-- participants in one active job. Multiple SELECT policies on one table are
-- OR'd together in Postgres, so this only widens access -- it cannot narrow
-- what the existing policy already allows. Lets FleetMapScreen use a plain
-- Realtime subscription instead of a polling API route.
-- ---------------------------------------------------------------------------

drop policy if exists "Fleet operators can read own fleet live position" on ambulance_current_location;

create policy "Fleet operators can read own fleet live position" on ambulance_current_location
  for select using (
    ambulance_id in (
      select a.id from ambulances a
        join ambulance_provider_admins apa on apa.provider_id = a.provider_id
       where apa.user_id = (select id from users where auth_id = auth.uid()) and apa.is_active
    )
  );

-- ---------------------------------------------------------------------------
-- find_candidate_units(): re-pointed at the provider's own settings
-- (ambulance_providers.private_fleet / service_radius_m / service_hours_247,
-- added above) instead of the hospital's (hospitals.ambulance_private_fleet
-- etc) -- a hospital-owned provider's own admin sets these now, the same as
-- an independent operator does, since both register and are managed the
-- same way. Merged onto 20260828000004's version, NOT 20260730000001's --
-- that migration was the latest to touch this function (clock-skew fix:
-- freshness judged on received_at, not the device-stamped recorded_at, via
-- unit_location_max_age_seconds() rather than a hardcoded interval; adds
-- location_age_seconds to the return row) and skipping straight to a stale
-- copy would have silently reintroduced the exact bug that migration fixed.
-- Everything below is that version, with only the hospital-vs-provider
-- settings source swapped.
-- ---------------------------------------------------------------------------

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
      cross join req
     where a.is_active
       and p.is_active
       and a.status = 'available'
       and req.reference_time between s.starts_at and s.ends_at
       -- Server-stamped, so a crew phone with a slow clock stays dispatchable
       -- and one with a fast clock cannot fake being live.
       and loc.received_at > now() - make_interval(secs => unit_location_max_age_seconds())
       -- effective radius: a provider may cap how far it travels
       and ST_DWithin(loc.location, req.pickup_point, least(p_radius_m, coalesce(p.service_radius_m, p_radius_m)))
       -- effective care level is the lower of vehicle and crew
       and least(tier_rank(a.vehicle_tier), tier_rank(s.crew_tier))
             >= tier_rank(req.required_tier)
       and a.capabilities @> req.required_capabilities
       -- provider service area, when one is defined
       and (p.service_area is null or ST_Covers(p.service_area, req.pickup_point))
       -- a private fleet only serves its own hospital's requests once a destination is chosen
       and (p.hospital_id is null or p.private_fleet is not true
            or req.destination_hospital_id is null or req.destination_hospital_id = p.hospital_id)
       -- a provider that isn't 24/7 only dispatches within its own hospital's operating hours
       and (p.hospital_id is null or p.service_hours_247 or is_hospital_open_now(p.hospital_id))
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
