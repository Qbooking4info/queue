-- Queue — actually reserve a time slot when an appointment claims it
--
-- Audit finding 5-A (MEDIUM). `increment_slot_booking()` exists to hold a slot's
-- capacity (20260720000003_fix_slots_rls.sql:23) and has never been called from
-- anywhere: the only references in the repo are the generated TypeScript types.
-- So `booked_count` never moved, and two patients picking the same slot both got
-- told they were confirmed.
--
-- Invisible today because the feature is dormant — `time_slots` has 0 rows and
-- 0 appointments carry a `slot_id`; booking runs on the hardcoded OPD grid. It
-- becomes a real double-booking the first time a hospital generates a schedule.
--
-- WHY A TRIGGER RATHER THAN CALLING THE RPC. The audit's suggestion was to call
-- increment_slot_booking() from the booking path, but there is more than one
-- booking path: the mobile app inserts into `appointments` directly through
-- PostgREST (mobile/lib/api.ts), the web API routes insert on the service-role
-- client, and staff create walk-ins from the dashboard. A call site added to one
-- of them leaves the others unguarded, and the RPC is service_role-only so the
-- mobile path could not call it at all. Enforcing it on the row itself covers
-- every writer, present and future, and keeps the reservation in the same
-- transaction as the appointment — which is what makes it atomic.
--
-- Note `is_available` is deliberately left alone. It is the staff-facing switch
-- for closing a slot; capacity is enforced by the `booked_count < max_capacity`
-- predicate, so a full slot cannot be claimed whether or not anyone flips it.

create or replace function reserve_appointment_slot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claimed uuid;
begin
  -- Conditional UPDATE ... RETURNING is the whole reservation: Postgres takes a
  -- row lock, and a concurrent booking either sees the incremented count or
  -- matches nothing. No read-then-write window to lose.
  update time_slots
     set booked_count = booked_count + 1
   where id = new.slot_id
     and is_available = true
     and booked_count < max_capacity
  returning id into v_claimed;

  if v_claimed is null then
    raise exception 'That time slot is no longer available'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function reserve_appointment_slot() is
  'Atomically claims capacity on time_slots for an appointment that names a slot_id. Raises if the slot is full or closed, so the appointment insert fails rather than double-booking (audit 5-A).';

create or replace function release_appointment_slot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- greatest(...,0) so a mis-set counter can never go negative and permanently
  -- under-report a slot's occupancy.
  update time_slots
     set booked_count = greatest(booked_count - 1, 0)
   where id = old.slot_id;
  return null;
end;
$$;

comment on function release_appointment_slot() is
  'Returns capacity to a time slot when the appointment holding it is cancelled, marked no-show, deleted, or moved to a different slot.';

-- ── Claim ────────────────────────────────────────────────────────────────────

drop trigger if exists trg_reserve_appointment_slot on appointments;

create trigger trg_reserve_appointment_slot
  before insert on appointments
  for each row
  when (new.slot_id is not null and coalesce(new.status, '') not in ('cancelled', 'no_show'))
  execute function reserve_appointment_slot();

-- Moving an appointment to a different slot has to claim the new one, or the
-- reschedule path becomes the way around the capacity check.
drop trigger if exists trg_reserve_appointment_slot_moved on appointments;

create trigger trg_reserve_appointment_slot_moved
  before update of slot_id on appointments
  for each row
  when (new.slot_id is not null and new.slot_id is distinct from old.slot_id)
  execute function reserve_appointment_slot();

-- ── Release ──────────────────────────────────────────────────────────────────

drop trigger if exists trg_release_appointment_slot_cancelled on appointments;

create trigger trg_release_appointment_slot_cancelled
  after update of status on appointments
  for each row
  when (
    old.slot_id is not null
    and old.status not in ('cancelled', 'no_show')
    and new.status in ('cancelled', 'no_show')
  )
  execute function release_appointment_slot();

drop trigger if exists trg_release_appointment_slot_moved on appointments;

create trigger trg_release_appointment_slot_moved
  after update of slot_id on appointments
  for each row
  when (old.slot_id is not null and new.slot_id is distinct from old.slot_id)
  execute function release_appointment_slot();

drop trigger if exists trg_release_appointment_slot_deleted on appointments;

create trigger trg_release_appointment_slot_deleted
  after delete on appointments
  for each row
  when (old.slot_id is not null and old.status not in ('cancelled', 'no_show'))
  execute function release_appointment_slot();
