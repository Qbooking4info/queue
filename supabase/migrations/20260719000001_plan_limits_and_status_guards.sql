-- ── #2: Terminal status guard ────────────────────────────────────────────────
-- Prevents status changes away from completed / cancelled / no_show.
-- no_show is deliberate (patient didn't attend); changing it would corrupt audit trail.

CREATE OR REPLACE FUNCTION guard_appointment_status()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('completed', 'cancelled', 'no_show') AND NEW.status <> OLD.status THEN
    RAISE EXCEPTION 'Appointment status "%" is final and cannot be changed', OLD.status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointment_status_guard ON appointments;
CREATE TRIGGER appointment_status_guard
  BEFORE UPDATE OF status ON appointments
  FOR EACH ROW EXECUTE FUNCTION guard_appointment_status();


-- ── #3: Plan monthly booking cap ─────────────────────────────────────────────
-- Fires on every INSERT into appointments; rejects the insert if the hospital has
-- reached the max_monthly_bookings limit defined in their subscription plan.
-- NULL limit = unlimited. Cancelled bookings don't count toward the cap.

CREATE OR REPLACE FUNCTION check_plan_booking_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_max   integer;
  v_count bigint;
BEGIN
  SELECT sp.max_monthly_bookings INTO v_max
  FROM hospital_subscriptions hs
  JOIN subscription_plans sp ON sp.id = hs.plan_id
  WHERE hs.hospital_id = NEW.hospital_id AND hs.status = 'active'
  LIMIT 1;

  -- NULL = unlimited plan
  IF v_max IS NULL THEN RETURN NEW; END IF;

  SELECT COUNT(*) INTO v_count
  FROM appointments
  WHERE hospital_id = NEW.hospital_id
    AND date_trunc('month', created_at) = date_trunc('month', now())
    AND status <> 'cancelled';

  IF v_count >= v_max THEN
    RAISE EXCEPTION 'Monthly booking limit of % reached. Upgrade your plan to accept more bookings.', v_max;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_plan_booking_limit ON appointments;
CREATE TRIGGER enforce_plan_booking_limit
  BEFORE INSERT ON appointments
  FOR EACH ROW EXECUTE FUNCTION check_plan_booking_limit();
