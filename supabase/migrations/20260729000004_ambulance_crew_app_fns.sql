-- Queue — ambulance services: crew app support functions
--
-- Same shape as get_my_staff_profile(): SECURITY DEFINER functions that
-- resolve auth.uid() server-side, so the crew app never queries
-- ambulance_crew/ambulance_shifts/dispatch_offers/transport_requests
-- directly (RLS has no self-read policy on the first two, and would
-- silently return zero rows rather than erroring — see the mobile RLS
-- rule: always RPC, never direct table reads, for role-scoped access).

-- ---------------------------------------------------------------------------
-- Crew identity
-- ---------------------------------------------------------------------------

create or replace function get_my_crew_profile()
returns table (
  crew_id       uuid,
  provider_id   uuid,
  provider_name text,
  crew_role     text,
  crew_tier     text
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.provider_id, p.name, c.crew_role, c.crew_tier
    from ambulance_crew c
    join ambulance_providers p on p.id = c.provider_id
   where c.user_id = (select id from users where auth_id = auth.uid())
     and c.is_active
   limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Pending offers for whichever unit the calling crew member is on shift for
-- right now. Multiple crew can share a unit's shift, so any of them may see
-- and act on the same offer — the accept race is still resolved atomically
-- by accept_dispatch_offer().
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
         join ambulance_crew c        on c.id = sc.crew_member_id
        where c.user_id = (select id from users where auth_id = auth.uid())
          and c.is_active
          and now() between s.starts_at and s.ends_at
     )
   order by o.offered_at;
$$;

-- ---------------------------------------------------------------------------
-- The crew's current active job, if their on-shift unit has one.
-- ---------------------------------------------------------------------------

create or replace function get_my_active_job()
returns table (
  request_id          uuid,
  booking_ref         text,
  status              text,
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
  select r.id, r.booking_ref, r.status, r.triage_level, r.symptom_description,
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
         join ambulance_crew c        on c.id = sc.crew_member_id
        where c.user_id = (select id from users where auth_id = auth.uid())
          and c.is_active
          and now() between s.starts_at and s.ends_at
     )
   limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Crew-driven status transition. Deliberately narrower than the full state
-- machine: crew can push a job from matched through arrived_at_destination,
-- but arrived_at_destination -> completed requires an actor from the
-- receiving facility (the clinical handover boundary — see docs/ambulance-design.md
-- section 2), so it is intentionally not reachable through this function.
-- ---------------------------------------------------------------------------

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
         join ambulance_crew c        on c.id = sc.crew_member_id
        where c.user_id = (select id from users where auth_id = auth.uid())
          and c.is_active
          and now() between s.starts_at and s.ends_at
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
