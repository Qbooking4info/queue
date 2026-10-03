-- Lets hospital staff and doctors move a patient's appointment date/time
-- themselves, as long as the patient hasn't checked in yet. The existing
-- reschedule path (packages/shared/lib/api.ts's rescheduleAppointment())
-- inserts a brand-new linked row and cancels the original -- safe for a
-- patient rescheduling their own single booking, but wrong for staff: the
-- BEFORE INSERT enforce_reschedule_limit trigger caps a booking chain at one
-- reschedule ever, and a second row would double-count against
-- enforce_plan_booking_limit's monthly quota. Staff/doctor reschedule instead
-- mutates the same row in place, so neither INSERT-time trigger ever fires.
--
-- reschedule_reason is separate from the patient-facing `reason` column
-- (which holds why the visit was booked in the first place) -- this is the
-- staff-entered note for why the time changed.
alter table appointments
  add column if not exists reschedule_reason text;
