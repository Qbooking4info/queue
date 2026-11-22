-- Appointment / queue flow repairs — review of 2026-10-27.
--
-- Three defects, all confirmed against production before writing this:
--   1. Nothing stops two patients booking one doctor at one time (4 such pairs
--      exist), because the only capacity check hangs off a slot_id that no
--      appointment has ever carried.
--   2. The nightly sweep cannot close a consult that was started without a
--      check-in — one has been "in progress" for 58 days.
--   3. Completing an appointment by any path except end_consultation leaves
--      consult_ended_at null, so the consult never contributes to the wait
--      estimate — 14 of 60 completed appointments.

-- ── 1. One live appointment per doctor, date and time ───────────────────────
--
-- The existing reserve_appointment_slot trigger enforces time_slots.max_capacity,
-- but only for a row with a slot_id. time_slots is empty in production and no
-- appointment has ever set one, so that trigger has never once run its check and
-- capacity is effectively unlimited.
--
-- Rather than require every hospital to configure availability before it can
-- take a booking -- a product change, not a repair -- this guards the thing that
-- actually goes wrong: two live appointments on the same doctor at the same
-- moment. Where a real slot IS set, the capacity trigger still governs (a slot
-- may legitimately hold more than one), so the two do not overlap.

CREATE OR REPLACE FUNCTION public.enforce_single_live_booking_per_slot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Only a row that actually occupies a named time on a named doctor.
  IF NEW.doctor_id IS NULL OR NEW.appointment_date IS NULL OR NEW.start_time IS NULL THEN
    RETURN NEW;
  END IF;
  -- Terminal rows free their time.
  IF NEW.status IN ('cancelled', 'no_show') THEN
    RETURN NEW;
  END IF;
  -- A real slot has a capacity of its own; reserve_appointment_slot owns that case.
  IF NEW.slot_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  -- An emergency is never turned away because the hour looks full.
  IF NEW.urgency = 'emergency' THEN
    RETURN NEW;
  END IF;
  -- Staff booking at the desk can see the room and judge for themselves; a
  -- walk-in arriving at a busy hour must not be refused by a database rule.
  IF NEW.booked_by_staff_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Serialise would-be bookers of the same minute, so two simultaneous requests
  -- cannot both find the time free. Same pattern as renumber_doctor_queue.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    NEW.doctor_id::text || ':' || NEW.appointment_date::text || ':' || NEW.start_time::text, 0));

  IF EXISTS (
    SELECT 1 FROM appointments a
    WHERE a.doctor_id = NEW.doctor_id
      AND a.appointment_date = NEW.appointment_date
      AND a.start_time = NEW.start_time
      AND a.status NOT IN ('cancelled', 'no_show')
      AND a.id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION 'That time has just been taken. Please choose another.'
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_single_live_booking_per_slot ON appointments;
CREATE TRIGGER enforce_single_live_booking_per_slot
  BEFORE INSERT OR UPDATE OF doctor_id, appointment_date, start_time, status, slot_id
  ON appointments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_single_live_booking_per_slot();

-- ── 2. A consult always records when it ended ───────────────────────────────
--
-- consult_duration_secs is generated from started/ended, and the queue's wait
-- estimate is the median of it. end_consultation sets the stamp, but set_status,
-- the nightly sweep and any direct update did not, so those consults silently
-- left the sample. A trigger covers every path at once, including paths added
-- later.
--
-- Existing unstamped rows are deliberately NOT backfilled: their real end time is
-- unknown, and inventing one would feed a wrong number into the very median this
-- is meant to protect. They stay null and stay excluded.

CREATE OR REPLACE FUNCTION public.stamp_consult_end()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IN ('completed', 'cancelled', 'no_show')
     AND OLD.status IS DISTINCT FROM NEW.status
     AND NEW.consult_started_at IS NOT NULL
     AND NEW.consult_ended_at IS NULL THEN
    NEW.consult_ended_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stamp_consult_end ON appointments;
CREATE TRIGGER stamp_consult_end
  BEFORE UPDATE OF status ON appointments
  FOR EACH ROW EXECUTE FUNCTION public.stamp_consult_end();

-- ── 3. The nightly sweep reaches rows with no check-in date ─────────────────
--
-- Every sweep below compared `check_in_date < current_date`. For a consult
-- started straight from 'confirmed' that column is null, and `null < date` is
-- null, not true -- so the rows most in need of closing were the exact rows the
-- sweep could never see. COALESCE falls back through the dates that do exist.

CREATE OR REPLACE FUNCTION public.process_missed_appointments()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_today date := current_date;
BEGIN
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
    AND NOT EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.type = 'reschedule_prompt'
        AND (n.data->>'appointment_id')::uuid = a.id
    );

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

  WITH stuck_checkin AS (
    UPDATE appointments
    SET status = 'no_show',
        no_show_at = now(),
        reschedule_deadline = now() + INTERVAL '48 hours',
        updated_at = now()
    WHERE status = 'checked_in'
      AND COALESCE(check_in_date, appointment_date, created_at::date) < v_today
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

  -- consult_ended_at is left to stamp_consult_end above, so a consult closed
  -- here records a duration the same way one closed by the doctor does.
  UPDATE appointments
  SET status = 'completed',
      updated_at = now()
  WHERE status = 'in_progress'
    AND COALESCE(check_in_date, appointment_date, consult_started_at::date, created_at::date) < v_today;
END;
$$;

-- ── The consult this left open ─────────────────────────────────────────────
--
-- One virtual consult has been in progress since 2026-08-31. Scoped to a week so
-- this closes abandoned consults only and can never touch a live clinic.
UPDATE appointments
SET status = 'completed', updated_at = now()
WHERE status = 'in_progress'
  AND consult_started_at < now() - INTERVAL '7 days';
