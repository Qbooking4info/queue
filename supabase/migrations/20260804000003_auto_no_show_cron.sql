-- ── Auto no-show + reschedule-prompt daily job ───────────────────────────────
-- 1 day after a missed appointment (still pending/confirmed/checked_in, i.e.
-- never completed and never rescheduled away): notify the patient asking if
-- they want to reschedule.
-- 2+ days after: auto-mark as no_show (appointment_status_guard already makes
-- no_show terminal -- this only ever fires from a non-terminal status, so it
-- can't conflict with that trigger).
--
-- In-app notification only (writes directly to `notifications`) -- pg_cron
-- runs inside Postgres with no pg_net/http extension available anywhere in
-- this project, so it can't call the Expo push endpoint notifyPatient() (web/
-- src/lib/notify-patient.ts) does from Node. Same graceful-degradation the
-- app already relies on: notifyPatient's own push half is best-effort and
-- silently skipped when there's no push token.
--
-- Uses <= for the no-show pass (not =) so a day the job doesn't run for any
-- reason doesn't let an appointment slip through permanently -- matches this
-- project's existing nightly reconciliation pattern (recompute_denormalised_counters).

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

  -- ── Day 2+: auto no-show ────────────────────────────────────────────────
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
END;
$$;

REVOKE ALL ON FUNCTION process_missed_appointments() FROM public, anon, authenticated;

SELECT cron.schedule(
  'process-missed-appointments',
  '0 3 * * *', -- 03:00 UTC nightly, after recompute-denormalised-counters (02:00)
  $$SELECT process_missed_appointments();$$
);
