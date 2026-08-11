-- Queue — constrain `appointments.urgency` and stop patients from re-writing it
--
-- Audit finding 6-A (HIGH). The fee arithmetic in web/src/lib/fees.ts is
-- server-side and never accepts an amount from the client, but one of its
-- inputs was client-written: `urgency`, which drives the 2x emergency premium.
-- The mobile app inserts into `appointments` directly through Supabase rather
-- than through a validating API route, and nothing constrained the column.
--
-- Two problems, closed here:
--
--  1. NO CHECK CONSTRAINT. `urgency` was free text. A typo ('Emergency',
--     'EMERGENCY') silently reads as non-emergency everywhere — the fee at
--     web/src/lib/fees.ts and the queue ordering at
--     20260805000001_atomic_queue_renumbering.sql:62 both compare against the
--     exact string 'emergency'. That is a triage bug, not just a billing one.
--
--  2. MUTABLE AFTER BOOKING. The genuinely profitable exploit was not booking
--     cheap — under-declaring urgency also costs the patient their place in the
--     queue, so it is self-limiting. It was booking as 'routine', paying the
--     single fee, and then UPDATEing the row to 'emergency' to be seen first at
--     the routine price. Pinning the column against patient updates removes
--     that path; the price and the priority now come from the same declaration.
--
-- Triage genuinely does change after a patient arrives, so staff must still be
-- able to escalate. The trigger allows the hospital's own staff and the service
-- role, and refuses everyone else.
--
-- Live data checked before adding the constraint: 28 appointment rows, values
-- 'routine' (21) and 'emergency' (7). Nothing is invalidated by this. 'urgent'
-- is included because the mobile booking payload type already offers it.

-- ── 1. Valid values ──────────────────────────────────────────────────────────

alter table appointments drop constraint if exists appointments_urgency_check;

alter table appointments
  add constraint appointments_urgency_check
  check (urgency is null or urgency in ('routine', 'urgent', 'emergency'));

comment on column appointments.urgency is
  'Triage level: routine | urgent | emergency. Drives both the 2x emergency fee and queue ordering. Set at booking; afterwards only hospital staff may change it (see pin_appointment_urgency()).';

-- ── 2. Immutable to the patient after insert ─────────────────────────────────

create or replace function pin_appointment_urgency()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_is_staff boolean := false;
begin
  -- Unchanged is always fine; most appointment updates never touch this.
  if new.urgency is not distinct from old.urgency then
    return new;
  end if;

  -- Server-side code paths (API routes on the service-role client, other
  -- SECURITY DEFINER functions, migrations) are trusted. auth.uid() is NULL
  -- there because there is no end-user JWT.
  if auth.uid() is null then
    return new;
  end if;

  select id into v_user_id from users where auth_id = auth.uid();
  if v_user_id is null then
    raise exception 'Not permitted to change appointment urgency'
      using errcode = '42501';
  end if;

  -- Staff at the hospital the appointment belongs to: admins, clinic admins,
  -- and the doctor seeing the patient. Triage is theirs to revise.
  select exists (
    select 1 from hospital_admins
     where user_id = v_user_id and hospital_id = new.hospital_id and is_active
    union all
    select 1 from clinic_admins
     where user_id = v_user_id and hospital_id = new.hospital_id and is_active
    union all
    select 1 from doctors d
     where d.hospital_id = new.hospital_id
       and (d.auth_user_id = auth.uid() or d.user_id = v_user_id)
  ) into v_is_staff;

  if not v_is_staff then
    -- Deliberately explicit: a patient hitting this is not doing something
    -- ambiguous, and a silent revert would leave the app showing a level the
    -- hospital never agreed to.
    raise exception 'Only hospital staff can change the urgency of an appointment'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function pin_appointment_urgency() is
  'Blocks non-staff from changing appointments.urgency after booking. Without this a patient could book as routine, pay the single fee, then escalate to emergency for queue priority at the routine price (audit 6-A).';

drop trigger if exists trg_pin_appointment_urgency on appointments;

create trigger trg_pin_appointment_urgency
  before update of urgency on appointments
  for each row
  execute function pin_appointment_urgency();
