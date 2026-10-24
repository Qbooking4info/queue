-- Queue — a doctor can't hold two confirmed direct bookings at the same time
--
-- 2026-10-13 audit M6. Direct (hospital-less) bookings name the doctor by
-- doctor_user_id and a date/start_time, and nothing stopped two of them for the same
-- slot both being approved: patients book freely as 'pending', and approve
-- (PATCH /api/appointments/direct/[id]) only checked the row's own status. Hospital
-- bookings are capacity-checked through time_slots (20260811000003); direct ones had
-- no equivalent.
--
-- Only live states are covered: any number of patients may *request* a slot
-- (pending), and cancelled/completed/no-show rows don't hold it. Checked
-- 2026-10-13: no existing rows conflict.

create unique index if not exists appointments_direct_doctor_slot_live
  on appointments (doctor_user_id, appointment_date, start_time)
  where doctor_user_id is not null
    and status in ('confirmed', 'checked_in', 'in_progress');
