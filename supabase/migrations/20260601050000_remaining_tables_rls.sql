-- RLS for remaining tables that lacked policies.

-- ── subscription_plans (read-only for everyone; writes only via service role) ─
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read active subscription plans" ON subscription_plans;
CREATE POLICY "Public can read active subscription plans" ON subscription_plans
  FOR SELECT USING (is_active = true);

-- ── availability_templates ─────────────────────────────────────────────────
ALTER TABLE availability_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read availability templates" ON availability_templates;
CREATE POLICY "Public can read availability templates" ON availability_templates
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Hospital admins manage availability templates" ON availability_templates;
CREATE POLICY "Hospital admins manage availability templates" ON availability_templates
  FOR ALL USING (
    doctor_id IN (
      SELECT id FROM doctors
      WHERE hospital_id IN (
        SELECT hospital_id FROM hospital_admins
        WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
      )
    )
  );

-- ── slot_overrides ─────────────────────────────────────────────────────────
ALTER TABLE slot_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read slot overrides" ON slot_overrides;
CREATE POLICY "Public can read slot overrides" ON slot_overrides
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Hospital admins manage slot overrides" ON slot_overrides;
CREATE POLICY "Hospital admins manage slot overrides" ON slot_overrides
  FOR ALL USING (
    doctor_id IN (
      SELECT id FROM doctors
      WHERE hospital_id IN (
        SELECT hospital_id FROM hospital_admins
        WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
      )
    )
  );

-- ── hospital_images ────────────────────────────────────────────────────────
ALTER TABLE hospital_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read hospital images" ON hospital_images;
CREATE POLICY "Public can read hospital images" ON hospital_images
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Hospital admins manage hospital images" ON hospital_images;
CREATE POLICY "Hospital admins manage hospital images" ON hospital_images
  FOR ALL USING (
    hospital_id IN (
      SELECT hospital_id FROM hospital_admins
      WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
        AND role IN ('admin', 'owner')
    )
  );

-- ── appointment_documents: add staff upload/update policies ────────────────
-- SELECT policy already exists from 20260531150000_public_tables_rls.sql

DROP POLICY IF EXISTS "Hospital staff can upload appointment documents" ON appointment_documents;
CREATE POLICY "Hospital staff can upload appointment documents" ON appointment_documents
  FOR INSERT WITH CHECK (
    appointment_id IN (
      SELECT id FROM appointments
      WHERE hospital_id IN (
        SELECT hospital_id FROM hospital_admins
        WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "Hospital staff can update appointment documents" ON appointment_documents;
CREATE POLICY "Hospital staff can update appointment documents" ON appointment_documents
  FOR UPDATE USING (
    appointment_id IN (
      SELECT id FROM appointments
      WHERE hospital_id IN (
        SELECT hospital_id FROM hospital_admins
        WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "Hospital staff can delete appointment documents" ON appointment_documents;
CREATE POLICY "Hospital staff can delete appointment documents" ON appointment_documents
  FOR DELETE USING (
    appointment_id IN (
      SELECT id FROM appointments
      WHERE hospital_id IN (
        SELECT hospital_id FROM hospital_admins
        WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
      )
    )
  );
