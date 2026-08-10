-- Queue — unit duty state: breaking the supply deadlock
--
-- Step 3 of Queue-Ambulance-Stage1-Scope.md, and the reason dispatch has never
-- matched anything.
--
-- find_candidate_units() requires two things of a unit:
--     a.status = 'available'
--     a fresh row in ambulance_current_location (< 2 minutes old)
--
-- Neither was reachable. ambulances.status defaults to 'offline' and NOTHING in
-- the entire codebase ever wrote 'available' — no endpoint, no RPC, no screen.
-- And the crew app only sent location pings while it already had a job, so an
-- idle unit never reported a position. To be dispatchable you needed a fresh
-- location; you only sent one once you had a job; you only got a job if you
-- were dispatchable. The candidate set was structurally always empty, which is
-- why the sophisticated scoring engine had nothing to rank.
--
-- This migration adds the missing writer. The app side adds the missing
-- heartbeat.
--
-- ---------------------------------------------------------------------------
-- WHY GOING ON DUTY WRITES AN ambulance_shifts ROW
--
-- find_candidate_units also requires the request time to fall inside a shift.
-- Rather than introduce a parallel "duty session" concept and teach the matching
-- engine about it, going on duty simply creates a shift starting now. The
-- engine, effectiveTier = least(vehicle, crew), and the shift-headroom filter
-- all keep working untouched.
--
-- That turns the rota from a pre-filing burden into a live duty record, and lets
-- hospital fleets and independent operators use one identical path.
-- ---------------------------------------------------------------------------

-- Must match the freshness window hardcoded in find_candidate_units. Exposed so
-- the crew app can tell a crew the truth about whether dispatch can currently
-- see them, using the same number dispatch uses.
create or replace function unit_location_ttl_seconds()
returns integer
language sql
immutable
parallel safe
as $$ select 120 $$;

-- ---------------------------------------------------------------------------
-- Authorization
--
-- Two supplier types, two identity paths (see 20260730000001):
--   * independent operator crew -> ambulance_crew.user_id
--   * hospital fleet crew/admin -> hospital_admins.user_id, scoped by hospital
-- Returns the caller's shift-crew identity for the unit, or raises.
-- ---------------------------------------------------------------------------
create or replace function assert_can_operate_unit(p_ambulance_id uuid)
returns table (crew_member_id uuid, hospital_admin_id uuid, crew_tier text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id     uuid;
  v_provider    ambulance_providers%rowtype;
  v_crew_id     uuid;
  v_crew_tier   text;
  v_admin_id    uuid;
  v_admin_tier  text;
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

  -- Independent operator crew
  select c.id, c.crew_tier into v_crew_id, v_crew_tier
    from ambulance_crew c
   where c.user_id = v_user_id and c.provider_id = v_provider.id and c.is_active
   limit 1;

  if v_crew_id is not null then
    return query select v_crew_id, null::uuid, v_crew_tier;
    return;
  end if;

  -- Hospital fleet: crew, or an admin/owner putting a rig on duty from a desk
  if v_provider.hospital_id is not null then
    select ha.id, ha.crew_tier into v_admin_id, v_admin_tier
      from hospital_admins ha
     where ha.user_id = v_user_id
       and ha.hospital_id = v_provider.hospital_id
       and ha.is_active
       and ha.role in ('admin', 'owner', 'ambulance_crew')
     limit 1;

    if v_admin_id is not null then
      return query select null::uuid, v_admin_id, coalesce(v_admin_tier, 'BLS');
      return;
    end if;
  end if;

  raise exception 'you are not authorised to operate this unit'
    using errcode = 'insufficient_privilege';
end;
$$;

-- ---------------------------------------------------------------------------
-- Go on / off duty
-- ---------------------------------------------------------------------------
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
    insert into ambulance_shift_crew (shift_id, crew_member_id, hospital_admin_id)
    values (v_shift_id, v_identity.crew_member_id, v_identity.hospital_admin_id)
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
-- What the crew app and the operator console render
--
-- Includes seconds_since_ping and visible_to_dispatch so a crew can see the
-- truth: being "on duty" is not the same as being dispatchable. Without a
-- position fresher than unit_location_ttl_seconds() they are invisible to
-- find_candidate_units no matter what their status says, and they should know
-- that rather than assume they are covering an area they are not.
-- ---------------------------------------------------------------------------
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
  visible_to_dispatch boolean
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
    -- Independent operator crew see their provider's fleet
    select a.id
      from ambulances a
      join ambulance_crew c on c.provider_id = a.provider_id
      cross join me
     where c.user_id = me.user_id and c.is_active and a.is_active
    union
    -- Hospital staff see their hospital's fleet
    select a.id
      from ambulances a
      join ambulance_providers p on p.id = a.provider_id
      join hospital_admins ha on ha.hospital_id = p.hospital_id
      cross join me
     where ha.user_id = me.user_id and ha.is_active
       and ha.role in ('admin', 'owner', 'ambulance_crew')
       and a.is_active and p.is_active
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
           and loc.recorded_at > now() - make_interval(secs => unit_location_ttl_seconds()))
    from mine
    join ambulances a            on a.id = mine.id
    join ambulance_providers p   on p.id = a.provider_id
    left join ambulance_shifts s on s.ambulance_id = a.id
                                and s.starts_at <= now() and s.ends_at > now()
    left join ambulance_current_location loc on loc.ambulance_id = a.id
   order by a.call_sign nulls last, a.plate_number;
$$;

revoke all on function set_unit_duty(uuid, boolean, text, numeric) from public, anon;
revoke all on function get_my_units() from public, anon;
revoke all on function assert_can_operate_unit(uuid) from public, anon;
grant execute on function set_unit_duty(uuid, boolean, text, numeric) to authenticated;
grant execute on function get_my_units() to authenticated;
