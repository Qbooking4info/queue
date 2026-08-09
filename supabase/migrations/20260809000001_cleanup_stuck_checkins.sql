-- ── Cleanup stuck checked-in / in-progress bookings ──────────────────────────
-- process_missed_appointments() (20260804000003) already sweeps pending/confirmed/
-- checked_in bookings based on how stale their appointment_date is -- but that leaves
-- two real gaps that just caused a live incident (two bookings stuck at a clinic,
-- invisible in every current-day queue view, blocking new bookings for those patients):
--
--   1. checkInAppointment() always sets check_in_date to *today*, regardless of
--      appointment_date (web/src/lib/appointment-checkin.ts) -- a booking dated for the
--      future that gets checked in is never caught by the appointment_date-based sweep,
--      because appointment_date hasn't "passed" yet from that sweep's point of view.
--   2. in_progress was never covered by the sweep at all -- a consultation that gets
--      started and then abandoned (staff forgets to tap Complete) stays open forever.
--
-- Both new clauses key off check_in_date instead of appointment_date -- check-in is a
-- real-time event, so "still open past the calendar day it happened" is unambiguously
-- stale; unlike the appointment_date sweep, no 2-day grace period is needed.
--
-- Resolution (per product decision): checked-in but never started -> no_show (they
-- physically showed up but were never seen, closest existing status); consultation
-- started but never ended -> completed (it almost certainly happened; staff just never
-- closed it out).

CREATE OR REPLACE FUNCTION process_missed_appointments()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_today date := current_date;
BEGIN
  -- ── Day 1: ask if they want to reschedule ──────────────────────────────
  INSERT INTO notifications (user_id, type, title, body, data, is_read, sent_via)
  SELECT
    a.patient_id,
    'reschedule_prompt',
    'Missed appointment?',
    'You had an appointment on ' || to_char(a.appointment_date, 'DD Mon') ||
      ' that hasn''t been marked complete. Want to reschedule?',
    jsonb_build_object('appointment_id', a.id, 'booking_ref', a.booking_ref),
    false,
    ARRAY['in_app']
  FROM appointments a
  WHERE a.appointment_date = v_today - INTERVAL '1 day'
    AND a.status IN ('pending', 'confirmed', 'checked_in')
    AND a.patient_id IS NOT NULL
    -- Don't ask twice if this function is ever run more than once on the same day.
    AND NOT EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.type = 'reschedule_prompt'
        AND (n.data->>'appointment_id')::uuid = a.id
    );

  -- ── Day 2+: auto no-show, by appointment_date ──────────────────────────
  WITH missed AS (
    UPDATE appointments
    SET status = 'no_show',
        no_show_at = now(),
        reschedule_deadline = now() + INTERVAL '48 hours',
        updated_at = now()
    WHERE appointment_date <= v_today - INTERVAL '2 days'
      AND status IN ('pending', 'confirmed', 'checked_in')
    RETURNING id, booking_ref, patient_id, appointment_date
  )
  INSERT INTO notifications (user_id, type, title, body, data, is_read, sent_via)
  SELECT
    m.patient_id,
    'no_show',
    'Appointment marked as missed',
    'Your appointment on ' || to_char(m.appointment_date, 'DD Mon') ||
      ' was marked as a no-show. You can still reschedule once for free within 48 hours.',
    jsonb_build_object('appointment_id', m.id, 'booking_ref', m.booking_ref),
    false,
    ARRAY['in_app']
  FROM missed m
  WHERE m.patient_id IS NOT NULL;

  -- ── Checked in, never started, left open past that calendar day: no-show ──
  WITH stuck_checkin AS (
    UPDATE appointments
    SET status = 'no_show',
        no_show_at = now(),
        reschedule_deadline = now() + INTERVAL '48 hours',
        updated_at = now()
    WHERE status = 'checked_in'
      AND check_in_date < v_today
    RETURNING id, booking_ref, patient_id, appointment_date
  )
  INSERT INTO notifications (user_id, type, title, body, data, is_read, sent_via)
  SELECT
    s.patient_id,
    'no_show',
    'Appointment marked as missed',
    'Your check-in on ' || to_char(s.appointment_date, 'DD Mon') ||
      ' was never called in for consultation and has been marked as a no-show. You can ' ||
      'still reschedule once for free within 48 hours.',
    jsonb_build_object('appointment_id', s.id, 'booking_ref', s.booking_ref),
    false,
    ARRAY['in_app']
  FROM stuck_checkin s
  WHERE s.patient_id IS NOT NULL;

  -- ── Consultation started, never ended, left open past that calendar day: complete ──
  -- No patient notification here -- unlike a no-show, a completed consultation isn't
  -- something the patient needs to act on, and no other completion path in this app
  -- notifies the patient either.
  UPDATE appointments
  SET status = 'completed',
      consult_ended_at = now(),
      updated_at = now()
  WHERE status = 'in_progress'
    AND check_in_date < v_today;
END;
$$;
