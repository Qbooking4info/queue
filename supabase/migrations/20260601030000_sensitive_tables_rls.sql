-- RLS for sensitive tables that had no policies at all.
-- Web admin routes use createAdminClient() (service role) so they bypass RLS.
-- These policies protect against direct anon-key access.

-- ── hospital_admins ────────────────────────────────────────────────────────
ALTER TABLE hospital_admins ENABLE ROW LEVEL SECURITY;

-- Staff can read admin records for their own hospital
DROP POLICY IF EXISTS "Hospital members can read own hospital admins" ON hospital_admins;
CREATE POLICY "Hospital members can read own hospital admins" ON hospital_admins
  FOR SELECT USING (
    hospital_id IN (
      SELECT hospital_id FROM hospital_admins ha2
      WHERE ha2.user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    )
  );

-- Users can read their own admin record (needed for role checks in mobile if ever added)
DROP POLICY IF EXISTS "Users can read own admin record" ON hospital_admins;
CREATE POLICY "Users can read own admin record" ON hospital_admins
  FOR SELECT USING (
    user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  );

-- ── hospital_subscriptions ─────────────────────────────────────────────────
ALTER TABLE hospital_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Hospital admins can read own subscription" ON hospital_subscriptions;
CREATE POLICY "Hospital admins can read own subscription" ON hospital_subscriptions
  FOR SELECT USING (
    hospital_id IN (
      SELECT hospital_id FROM hospital_admins
      WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    )
  );

-- ── payments ───────────────────────────────────────────────────────────────
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Patients can read own payments" ON payments;
CREATE POLICY "Patients can read own payments" ON payments
  FOR SELECT USING (
    patient_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  );

DROP POLICY IF EXISTS "Hospital admins can read hospital payments" ON payments;
CREATE POLICY "Hospital admins can read hospital payments" ON payments
  FOR SELECT USING (
    hospital_id IN (
      SELECT hospital_id FROM hospital_admins
      WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    )
  );

-- ── payouts ────────────────────────────────────────────────────────────────
ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Hospital admins can read own payouts" ON payouts;
CREATE POLICY "Hospital admins can read own payouts" ON payouts
  FOR SELECT USING (
    hospital_id IN (
      SELECT hospital_id FROM hospital_admins
      WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    )
  );

-- ── virtual_sessions ───────────────────────────────────────────────────────
ALTER TABLE virtual_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Patients can read own virtual sessions" ON virtual_sessions;
CREATE POLICY "Patients can read own virtual sessions" ON virtual_sessions
  FOR SELECT USING (
    appointment_id IN (
      SELECT id FROM appointments
      WHERE patient_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Hospital staff can read hospital virtual sessions" ON virtual_sessions;
CREATE POLICY "Hospital staff can read hospital virtual sessions" ON virtual_sessions
  FOR SELECT USING (
    appointment_id IN (
      SELECT id FROM appointments
      WHERE hospital_id IN (
        SELECT hospital_id FROM hospital_admins
        WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
      )
    )
  );

-- ── emr_integrations ──────────────────────────────────────────────────────
ALTER TABLE emr_integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Hospital admins can read own EMR integration" ON emr_integrations;
CREATE POLICY "Hospital admins can read own EMR integration" ON emr_integrations
  FOR SELECT USING (
    hospital_id IN (
      SELECT hospital_id FROM hospital_admins
      WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
        AND role IN ('admin', 'owner')
    )
  );
