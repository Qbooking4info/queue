-- ── BH3 + BH4 + BL4: Fix check_plan_booking_limit trigger ───────────────────
--
-- Previous version:
--   • Only looked up subscriptions with status = 'active' (ignored 'trialing')
--   • Did not block 'suspended' or 'cancelled' subscriptions at all
--   • Counted bookings by date_trunc('month', created_at) — should use appointment_date
--
-- This version:
--   1. Fetches the most recent subscription regardless of status.
--   2. BH4: Blocks inserts outright when subscription is 'suspended' or 'cancelled'.
--   3. BH3: Treats 'trialing' the same as 'active' for the monthly booking cap.
--   4. BL4: Counts bookings by appointment_date (the date the appointment is FOR),
--      not created_at (the date the booking was made).

CREATE OR REPLACE FUNCTION check_plan_booking_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_status text;
  v_max    integer;
  v_count  bigint;
BEGIN
  -- Fetch most recent subscription for this hospital (any status)
  SELECT hs.status, sp.max_monthly_bookings
  INTO v_status, v_max
  FROM hospital_subscriptions hs
  JOIN subscription_plans sp ON sp.id = hs.plan_id
  WHERE hs.hospital_id = NEW.hospital_id
  ORDER BY hs.created_at DESC
  LIMIT 1;

  -- BH4: block bookings for suspended or cancelled hospitals immediately
  IF v_status IN ('suspended', 'cancelled') THEN
    RAISE EXCEPTION
      'Hospital subscription is % — bookings are blocked. Contact support to restore access.',
      v_status;
  END IF;

  -- Only enforce the monthly cap for active or trialing subscriptions (BH3)
  IF v_status NOT IN ('active', 'trialing') THEN
    RETURN NEW; -- grace_period, expired, or no subscription → allow
  END IF;

  -- NULL max = unlimited plan
  IF v_max IS NULL THEN RETURN NEW; END IF;

  -- BL4: count by appointment_date in the current calendar month, not created_at
  SELECT COUNT(*) INTO v_count
  FROM appointments
  WHERE hospital_id = NEW.hospital_id
    AND date_trunc('month', appointment_date::date) = date_trunc('month', CURRENT_DATE)
    AND status <> 'cancelled';

  IF v_count >= v_max THEN
    RAISE EXCEPTION
      'Monthly booking limit of % reached. Upgrade your plan to accept more bookings.',
      v_max;
  END IF;

  RETURN NEW;
END;
$$;

-- Re-attach trigger (function is CREATE OR REPLACE so the trigger just needs re-binding)
DROP TRIGGER IF EXISTS enforce_plan_booking_limit ON appointments;
CREATE TRIGGER enforce_plan_booking_limit
  BEFORE INSERT ON appointments
  FOR EACH ROW EXECUTE FUNCTION check_plan_booking_limit();
