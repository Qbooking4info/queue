-- Repair campaign batch 2 (docs/repair/ISSUES.md): access-control fixes for virtual
-- consultations and ambulance dispatch. Every TypeScript caller of the functions and
-- tables restricted here uses the service-role client (web/src/app/api/**), which
-- these changes leave untouched.

-- ---------------------------------------------------------------------------
-- REP-001  virtual_sessions tokens readable by every staff member at the hospital
-- ---------------------------------------------------------------------------
-- The staff SELECT policy returned host_token/guest_token for every consult at the
-- hospital to every hospital_admins role (front desk, specialist, ambulance crew).
-- Joining Agora with a uid already in the channel pushes the real party out.
-- Nothing on the staff side reads this table with a user session: /api/virtual and
-- the dashboard use the service role, and the dashboard's live refresh also follows
-- appointments (whose status flips whenever a call starts or ends).
drop policy if exists "Hospital staff can read hospital virtual sessions" on public.virtual_sessions;
-- Production also carries three policies that no migration in this repo creates (found by
-- reading pg_policies on 2026-10-13): hospital admins could SELECT, INSERT and UPDATE
-- sessions -- read tokens, overwrite a guest_token, or mark a live consult ended. Every
-- session write is server-side (service role); none of these is used.
drop policy if exists "virtual_sessions_hospital_select" on public.virtual_sessions;
drop policy if exists "virtual_sessions_hospital_insert" on public.virtual_sessions;
drop policy if exists "virtual_sessions_hospital_update" on public.virtual_sessions;

-- Patients keep their own rows (policy "Patients can read own virtual sessions"), but
-- only the columns the call screen needs. host_token is no longer written at all
-- (web/src/app/api/virtual/token/route.ts); clear the copies already stored.
revoke select, insert, update, delete on public.virtual_sessions from anon, authenticated;
grant select (id, appointment_id, status, room_name, guest_token, started_at, ended_at, duration_secs, created_at)
  on public.virtual_sessions to authenticated;
update public.virtual_sessions set host_token = null where host_token is not null;

-- ---------------------------------------------------------------------------
-- REP-004  a cancelled / completed / no-show appointment left its call joinable
-- ---------------------------------------------------------------------------
create or replace function public.end_virtual_session_on_terminal_appointment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update virtual_sessions
     set status = 'ended',
         ended_at = now(),
         duration_secs = coalesce(duration_secs,
           case when started_at is not null then extract(epoch from now() - started_at)::int end)
   where appointment_id = new.id
     and status <> 'ended';
  return new;
end;
$$;
revoke all on function public.end_virtual_session_on_terminal_appointment() from public, anon, authenticated;

drop trigger if exists end_virtual_session_on_terminal_appointment on public.appointments;
create trigger end_virtual_session_on_terminal_appointment
  after update of status on public.appointments
  for each row
  when (new.status in ('completed', 'cancelled', 'no_show') and old.status is distinct from new.status)
  execute function public.end_virtual_session_on_terminal_appointment();

-- ---------------------------------------------------------------------------
-- REP-010  patients could INSERT transport_requests directly, bypassing dispatch
-- ---------------------------------------------------------------------------
-- A raw insert could set status='matched' with any assigned_unit_id (sending a real
-- crew to an attacker-chosen pickup) or a far-future search_deadline_at. The only
-- legitimate writer is POST /api/transport/request (service role). Reads keep their
-- existing policies; cancellation goes through cancel_my_transport().
drop policy if exists "Users can create own transport requests" on public.transport_requests;
revoke insert, update, delete on public.transport_requests from anon, authenticated;

-- REP-011/012/015 (record_unit_location, accept_dispatch_offer, get_request_pickup_latlng,
-- rank_destination_hospitals, sweepers executable by anyone) are handled by
-- 20261013000007_lock_down_internal_definer_functions.sql, written concurrently in another
-- session; not repeated here.

-- ---------------------------------------------------------------------------
-- REP-013  patient could not cancel while the system was still searching
-- ---------------------------------------------------------------------------
-- cancelled_by_requester fell in the "unit attached" branch, so cancel_my_transport()
-- on a requested/searching row raised a check violation and dispatch kept offering
-- the job. A cancelled request may or may not have had a unit.
alter table public.transport_requests drop constraint if exists unit_matches_status;
alter table public.transport_requests add constraint unit_matches_status check (
  status in ('cancelled_by_requester', 'cancelled_by_provider') or
  (status in ('requested','scheduled','searching','no_unit_available') and assigned_unit_id is null) or
  (status not in ('requested','scheduled','searching','no_unit_available') and assigned_unit_id is not null)
);

-- ---------------------------------------------------------------------------
-- REP-014  hospital-fleet crew could read every inbound request's patient details
-- ---------------------------------------------------------------------------
-- Crew are hospital_admins rows with role 'ambulance_crew'; their own active job is
-- covered by "Crew can read active assigned job".
drop policy if exists "Hospital staff can read inbound transports" on public.transport_requests;
create policy "Hospital staff can read inbound transports" on public.transport_requests
  for select using (
    destination_hospital_id in (
      select ha.hospital_id from hospital_admins ha
        join users u on u.id = ha.user_id
       where u.auth_id = auth.uid()
         and ha.role <> 'ambulance_crew'
      union
      select ca.hospital_id from clinic_admins ca
        join users u on u.id = ca.user_id
       where u.auth_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- REP-016  two concurrent SOS taps created two live requests (two ambulances)
-- ---------------------------------------------------------------------------
-- The route's read-then-insert guard races. Fails this migration (and rolls it all
-- back) if a requester already has two live emergency requests; resolve those first.
create unique index if not exists one_live_emergency_per_requester
  on public.transport_requests (requester_id)
  where request_type = 'emergency'
    and status in ('requested','searching','matched','en_route_to_patient','on_scene','transporting');
