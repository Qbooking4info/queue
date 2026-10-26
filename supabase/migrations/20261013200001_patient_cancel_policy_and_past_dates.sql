-- Queue — patients can cancel again; patients can't book in the past
--
-- 2026-10-13 audit H1 / H9 / C4 (past-date part). Builds on
-- 20261013100002_repair_b2_appointment_patient_guard.sql, which restricts what a
-- patient-side update may change to a cancel and computes refund_pct server-side.
--
-- H1: production's only patient UPDATE policy, "appointments_patient_update", has
-- USING (own row AND status IN ('pending','confirmed')) and no WITH CHECK, so
-- Postgres applies USING to the new row too — the cancelled row fails it and every
-- patient cancel errors with "new row violates row-level security policy". Proven
-- 2026-10-13 against a real patient account. The reschedule close-out hit the same
-- wall silently, leaving the original booking active beside the new one.
--
-- H9: the repo's 20260827000001 also creates "patients_update_own" (no status
-- restriction at all), which production does not have — a fresh environment built
-- from migrations would be far more permissive than prod. Dropped here so both
-- agree, with the guard trigger from 100002 as the column-level control.
--
-- C4: nothing stopped a patient inserting an appointment dated in the past.

drop policy if exists "patients_update_own" on appointments;

drop policy if exists "appointments_patient_update" on appointments;
create policy "appointments_patient_update" on appointments
  for update
  using (
    patient_id in (select current_patient_ids())
    and status in ('pending', 'confirmed')
  )
  with check (
    patient_id in (select current_patient_ids())
    and status in ('pending', 'confirmed', 'cancelled')
  );

create or replace function public.reject_patient_past_booking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not appointment_caller_is_patient_side(new.hospital_id, new.doctor_id, new.assigned_doctor_id, new.doctor_user_id) then
    return new;
  end if;
  -- Calendar date in Lagos, where every hospital on the platform is; the DB runs UTC.
  if new.appointment_date < (now() at time zone 'Africa/Lagos')::date then
    raise exception 'You can''t book an appointment in the past'
      using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function public.reject_patient_past_booking() from public, anon, authenticated;

drop trigger if exists reject_patient_past_booking on public.appointments;
create trigger reject_patient_past_booking
  before insert on public.appointments
  for each row execute function public.reject_patient_past_booking();
