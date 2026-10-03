-- ── Prevent a duplicate emergency booking from a dropped-connection retry ──
--
-- Emergency hospital bookings (urgency = 'emergency') are deliberately exempt
-- from check_duplicate_active_booking() (20260801000001) -- a patient in
-- crisis shouldn't be blocked from an emergency visit just because they
-- already have an unrelated routine appointment booked somewhere. But that
-- exemption also removed the only backstop against a panicked double-tap or
-- a retry-after-a-dropped-connection creating TWO separately-billed,
-- separately-queued emergency bookings for the same event -- createHospitalAppointment
-- (mobile/lib/api.ts) is a raw client insert with no request-level idempotency
-- key, and EmergencyBookingScreen.tsx's submit path has no retry guard beyond
-- a React boolean, which a killed/relaunched app or a client-side timeout does
-- not protect against.
--
-- This is a NARROW, time-windowed guard, not a return of the general
-- duplicate-active-booking block: it only rejects a second emergency insert
-- for the SAME patient/dependent within a short window of their most recent
-- one, and only while that one is still live (not already cancelled/rejected).
-- Two genuinely distinct emergencies for the same person minutes apart is
-- vanishingly rare and, even then, the patient can retry once the window
-- passes -- the failure mode this closes (an identical resubmission seconds
-- after a dropped confirm) is the overwhelmingly common one.
CREATE OR REPLACE FUNCTION check_emergency_booking_resubmit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_recent_id  uuid;
  v_recent_ref text;
BEGIN
  IF COALESCE(NEW.urgency, 'routine') <> 'emergency' THEN
    RETURN NEW;
  END IF;

  -- Unregistered walk-ins (no patient_id, e.g. a referral) have nothing to
  -- dedupe against -- same carve-out as check_duplicate_active_booking.
  IF NEW.patient_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id, booking_ref INTO v_recent_id, v_recent_ref
  FROM appointments
  WHERE patient_id = NEW.patient_id
    AND COALESCE(urgency, 'routine') = 'emergency'
    AND status NOT IN ('cancelled', 'rejected')
    AND created_at > now() - interval '3 minutes'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_recent_id IS NOT NULL THEN
    -- ERRCODE 23505 (unique_violation) so the client can distinguish "this was
    -- a duplicate-submission block, recover by showing the existing booking"
    -- from an ordinary insert failure, the same way Postgres's own unique-
    -- constraint violations already surface to supabase-js as error.code.
    RAISE EXCEPTION 'Duplicate emergency booking submission (existing: %)', v_recent_ref
      USING ERRCODE = '23505', DETAIL = v_recent_id::text;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_emergency_booking_resubmit_guard ON appointments;
CREATE TRIGGER enforce_emergency_booking_resubmit_guard
  BEFORE INSERT ON appointments
  FOR EACH ROW EXECUTE FUNCTION check_emergency_booking_resubmit();
