-- Repair campaign batch 2 (docs/repair/ISSUES.md REP-030, REP-031, REP-032).
--
-- Patients write appointments directly with their own JWT (packages/shared/lib/api.ts:
-- four booking inserts, cancelAppointment and the reschedule close-out). The RLS policy
-- "patients_update_own" (20260827000001) has no status or column restriction, and RLS
-- policies are OR'd, so a patient could update ANY column of their own row:
--   status='checked_in' + queue_rank_override  -> jump to the front of today's queue
--   approval_status='approved'                  -> skip the hospital's manual approval
--   refund_pct=100, hospital_id, doctor_id, diagnosis, doctor_notes, consult_* ...
-- and the INSERT policy only checks patient_id, so a booking could arrive pre-approved
-- or already checked in.
--
-- Column GRANTs would break every installed patient app (cancel sends refund_pct), so
-- these are guard triggers that apply only to a patient-side PostgREST caller. Staff,
-- doctors, the service role and SECURITY DEFINER RPCs are unaffected.

create or replace function public.appointment_caller_is_patient_side(p_hospital_id uuid, p_doctor_id uuid,
  p_assigned_doctor_id uuid, p_doctor_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
  v_uid  uuid := auth.uid();
  v_user uuid;
begin
  -- Only end-user API sessions are restricted; service_role, cron and direct SQL are not.
  if v_role <> 'authenticated' or v_uid is null then
    return false;
  end if;
  select id into v_user from users where auth_id = v_uid;

  if p_hospital_id is not null and (
       p_hospital_id in (select my_staff_hospital_ids())
    or exists (select 1 from clinic_admins ca where ca.user_id = v_user and ca.hospital_id = p_hospital_id
                and coalesce(ca.is_active, true))) then
    return false;
  end if;

  if p_doctor_user_id is not null and p_doctor_user_id = v_user then
    return false;
  end if;
  if exists (select 1 from doctors d
              where d.id in (p_doctor_id, p_assigned_doctor_id)
                and (d.auth_user_id = v_uid or d.user_id = v_user)) then
    return false;
  end if;

  return true;
end;
$$;
revoke all on function public.appointment_caller_is_patient_side(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.appointment_caller_is_patient_side(uuid, uuid, uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- UPDATE: a patient may only cancel. refund_pct is computed here, not trusted.
-- ---------------------------------------------------------------------------
create or replace function public.guard_patient_appointment_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowed text[] := array['status','cancellation_reason','cancelled_at','refund_pct','updated_at'];
  v_starts  timestamptz;
begin
  if not appointment_caller_is_patient_side(old.hospital_id, old.doctor_id, old.assigned_doctor_id, old.doctor_user_id) then
    return new;
  end if;

  if (to_jsonb(new) - v_allowed) is distinct from (to_jsonb(old) - v_allowed) then
    raise exception 'Patients can only cancel an appointment'
      using errcode = '42501', hint = 'Other changes go through the hospital or doctor.';
  end if;

  if new.status is distinct from old.status then
    if new.status <> 'cancelled' or old.status not in ('pending','confirmed','checked_in','in_progress') then
      raise exception 'Patients can only cancel an appointment'
        using errcode = '42501';
    end if;
    new.cancelled_at := now();
  end if;

  -- Server-side refund policy (mirrors the app: >24h before start -> 100, else 50),
  -- applied whenever the client tries to set it. Start time is wall-clock Lagos.
  if new.refund_pct is distinct from old.refund_pct then
    begin
      v_starts := ((old.appointment_date::text || ' ' || coalesce(nullif(old.start_time::text, ''), '00:00'))::timestamp)
                  at time zone 'Africa/Lagos';
    exception when others then
      v_starts := (old.appointment_date::timestamp) at time zone 'Africa/Lagos';
    end;
    new.refund_pct := case when v_starts - now() > interval '24 hours' then 100 else 50 end;
  end if;

  return new;
end;
$$;
revoke all on function public.guard_patient_appointment_update() from public, anon, authenticated;

drop trigger if exists guard_patient_appointment_update on public.appointments;
create trigger guard_patient_appointment_update
  before update on public.appointments
  for each row execute function public.guard_patient_appointment_update();

-- ---------------------------------------------------------------------------
-- INSERT: a patient booking starts unprocessed; approval comes from the hospital.
-- ---------------------------------------------------------------------------
create or replace function public.guard_patient_appointment_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mode text;
begin
  if not appointment_caller_is_patient_side(new.hospital_id, new.doctor_id, new.assigned_doctor_id, new.doctor_user_id) then
    return new;
  end if;

  -- Fields only staff, doctors or the queue engine may set.
  new.queue_position        := null;
  new.queue_rank_override   := null;
  new.estimated_wait        := null;
  new.check_in_date         := null;
  new.checked_in_at         := null;
  new.consult_started_at    := null;
  new.consult_ended_at      := null;
  new.consult_duration_secs := null;
  new.diagnosis             := null;
  new.doctor_notes          := null;
  new.no_show_at            := null;
  new.waiting_time_secs     := null;
  new.booked_by_staff_id    := null;
  new.assigned_doctor_id    := null;
  new.approval_note         := null;
  new.cancelled_at          := null;
  new.refund_pct            := 100;

  if new.hospital_id is null then
    -- Direct-to-doctor booking: the doctor always reviews it.
    new.status          := 'pending';
    new.approval_status := 'pending_review';
  else
    select approval_mode into v_mode from hospitals where id = new.hospital_id;
    if v_mode = 'manual' then
      new.approval_status := 'pending_approval';
      new.status          := 'pending';
    else
      new.approval_status := 'auto_approved';
      if new.status is null or new.status not in ('pending','confirmed') then
        new.status := 'pending';
      end if;
    end if;
  end if;

  return new;
end;
$$;
revoke all on function public.guard_patient_appointment_insert() from public, anon, authenticated;

drop trigger if exists guard_patient_appointment_insert on public.appointments;
create trigger guard_patient_appointment_insert
  before insert on public.appointments
  for each row execute function public.guard_patient_appointment_insert();

-- ---------------------------------------------------------------------------
-- REP-033: two concurrent bookings slipped past the duplicate-active-booking check
-- ---------------------------------------------------------------------------
-- 20260801000001's trigger reads then lets the insert proceed with no lock. Serialize
-- per (hospital, patient-or-dependent) inside the transaction so the second insert
-- sees the first. Implemented as an extra BEFORE INSERT trigger whose name sorts
-- before the existing check, so the lock is held when that check runs.
create or replace function public.lock_patient_booking_slot()
returns trigger
language plpgsql
as $$
begin
  perform pg_advisory_xact_lock(
    hashtextextended(coalesce(new.hospital_id::text, new.doctor_user_id::text, '') || ':' ||
                     coalesce(new.dependent_id, new.patient_id)::text, 0));
  return new;
end;
$$;
revoke all on function public.lock_patient_booking_slot() from public, anon, authenticated;

drop trigger if exists a00_lock_patient_booking_slot on public.appointments;
create trigger a00_lock_patient_booking_slot
  before insert on public.appointments
  for each row execute function public.lock_patient_booking_slot();
