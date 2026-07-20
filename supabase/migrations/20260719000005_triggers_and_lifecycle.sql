-- ─── 1. Rating recalculation triggers (Finding 4.4) ──────────────────────────
-- Keeps hospitals.avg_rating / review_count in sync with reviews table
CREATE OR REPLACE FUNCTION recalculate_hospital_rating()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE hid uuid := COALESCE(NEW.hospital_id, OLD.hospital_id);
BEGIN
  UPDATE hospitals SET
    avg_rating   = COALESCE(
      (SELECT AVG(rating)::numeric(3,2) FROM reviews WHERE hospital_id = hid AND is_visible = true),
      0
    ),
    review_count = (SELECT COUNT(*) FROM reviews WHERE hospital_id = hid AND is_visible = true)
  WHERE id = hid;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_reviews_hospital_rating ON reviews;
CREATE TRIGGER trg_reviews_hospital_rating
AFTER INSERT OR UPDATE OR DELETE ON reviews
FOR EACH ROW EXECUTE FUNCTION recalculate_hospital_rating();

-- Keeps doctors.avg_rating / review_count in sync
CREATE OR REPLACE FUNCTION recalculate_doctor_rating()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE did uuid := COALESCE(NEW.doctor_id, OLD.doctor_id);
BEGIN
  IF did IS NOT NULL THEN
    UPDATE doctors SET
      avg_rating   = COALESCE(
        (SELECT AVG(rating)::numeric(3,2) FROM reviews WHERE doctor_id = did AND is_visible = true),
        0
      ),
      review_count = (SELECT COUNT(*) FROM reviews WHERE doctor_id = did AND is_visible = true)
    WHERE id = did;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_reviews_doctor_rating ON reviews;
CREATE TRIGGER trg_reviews_doctor_rating
AFTER INSERT OR UPDATE OR DELETE ON reviews
FOR EACH ROW EXECUTE FUNCTION recalculate_doctor_rating();

-- ─── 2. Subscription lifecycle enforcement (Item 18) ─────────────────────────
ALTER TABLE hospital_subscriptions
  ADD COLUMN IF NOT EXISTS grace_period_ends_at date;

-- Expand the allowed status set; add only if a check constraint doesn't already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'hospital_subscriptions_status_check'
      AND conrelid = 'hospital_subscriptions'::regclass
  ) THEN
    ALTER TABLE hospital_subscriptions
      ADD CONSTRAINT hospital_subscriptions_status_check
      CHECK (status IN ('trialing', 'active', 'grace_period', 'suspended', 'cancelled', 'expired'));
  END IF;
END;
$$;

-- Trigger: enforce state-machine transitions on UPDATE
--   active + period expired  → grace_period (7-day window)
--   grace_period + expired   → suspended
CREATE OR REPLACE FUNCTION enforce_subscription_lifecycle()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'active'
     AND NEW.current_period_end IS NOT NULL
     AND NEW.current_period_end < CURRENT_DATE THEN
    NEW.status               := 'grace_period';
    NEW.grace_period_ends_at := NEW.current_period_end + INTERVAL '7 days';
  END IF;

  IF NEW.status = 'grace_period'
     AND NEW.grace_period_ends_at IS NOT NULL
     AND NEW.grace_period_ends_at < CURRENT_DATE THEN
    NEW.status := 'suspended';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_subscription_lifecycle ON hospital_subscriptions;
CREATE TRIGGER trg_subscription_lifecycle
BEFORE UPDATE ON hospital_subscriptions
FOR EACH ROW EXECUTE FUNCTION enforce_subscription_lifecycle();

-- ─── 3. Rate-limit log table (Item 20) ───────────────────────────────────────
-- Server-side only: used exclusively from the service-role admin client.
-- No RLS policies needed — service role bypasses RLS by design.
CREATE TABLE IF NOT EXISTS rate_limit_log (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  key        text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rate_limit_log_key_created_idx
  ON rate_limit_log (key, created_at DESC);

ALTER TABLE rate_limit_log ENABLE ROW LEVEL SECURITY;
-- Service-role client bypasses RLS; no anon/auth policies needed.

-- ─── 4. Geo covering index (Item 16 — PostGIS alternative) ───────────────────
-- Supports ORDER BY distance approximations without PostGIS.
-- For full spatial queries, enable the PostGIS extension in Supabase Dashboard
-- → Extensions → PostGIS, then run:
--   CREATE INDEX hospitals_location_gist ON hospitals
--     USING GIST (ST_MakePoint(longitude, latitude));
CREATE INDEX IF NOT EXISTS hospitals_geo_idx
  ON hospitals (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
