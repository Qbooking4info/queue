-- Repair campaign REP-032 follow-up: refund_pct was still client-controlled on a late cancel.
--
-- 20261013100002's guard recomputed refund_pct only when the client CHANGED it. Bookings
-- are inserted at 100, so a cancel that simply resent 100 kept a full refund even an hour
-- before the appointment (found by a rolled-back test against production, 2026-10-13).
--
-- Now: every patient-side transition to 'cancelled' gets the server's figure (>24h before
-- the Lagos start time -> 100, otherwise 50), and a patient can never edit refund_pct on
-- its own. Everything else in the guard is unchanged.

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

    -- Server-side refund policy, applied to every patient cancel. Start is wall-clock Lagos.
    begin
      v_starts := ((old.appointment_date::text || ' ' || coalesce(nullif(old.start_time::text, ''), '00:00'))::timestamp)
                  at time zone 'Africa/Lagos';
    exception when others then
      v_starts := (old.appointment_date::timestamp) at time zone 'Africa/Lagos';
    end;
    new.refund_pct := case when v_starts - now() > interval '24 hours' then 100 else 50 end;
  else
    -- Not a cancellation: the refund figure is not the patient's to change.
    new.refund_pct := old.refund_pct;
    new.cancelled_at := old.cancelled_at;
  end if;

  return new;
end;
$$;
revoke all on function public.guard_patient_appointment_update() from public, anon, authenticated;
