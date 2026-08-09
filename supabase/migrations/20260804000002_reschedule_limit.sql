-- ── Cap rescheedules at 1 per booking chain ──────────────────────────────────
-- reschedule_count tracks how many times the CURRENT row is itself the result
-- of a reschedule (0 = original booking, 1 = already rescheduled once). A
-- second reschedule attempt on a row where reschedule_count is already 1 is
-- rejected at the DB layer -- not just hidden in the UI -- since
-- rescheduleAppointment() (mobile/lib/api.ts) is a raw client insert under
-- RLS, the same layer every other booking-limit invariant in this schema
-- (enforce_no_duplicate_active_booking, enforce_plan_booking_limit) is
-- enforced at, for the same reason: a client-side-only check is trivially
-- bypassable.

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS reschedule_count integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION check_reschedule_limit()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_original_count integer;
BEGIN
  IF NEW.rescheduled_from IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT reschedule_count INTO v_original_count
  FROM appointments WHERE id = NEW.rescheduled_from;

  IF v_original_count IS NULL THEN
    -- Referenced row doesn't exist -- let the FK constraint reject this, not us.
    RETURN NEW;
  END IF;

  IF v_original_count >= 1 THEN
    RAISE EXCEPTION 'This booking has already been rescheduled once. Please make a new booking instead.'
      USING ERRCODE = '23514';
  END IF;

  NEW.reschedule_count := v_original_count + 1;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_reschedule_limit ON appointments;
CREATE TRIGGER enforce_reschedule_limit
  BEFORE INSERT ON appointments
  FOR EACH ROW EXECUTE FUNCTION check_reschedule_limit();
