-- RLS for tables the mobile app reads with the patient session.
-- Web API routes use createAdminClient() so they bypass RLS and are unaffected.

-- ── Public browse tables (no user restriction needed) ─────────────────────────

ALTER TABLE hospitals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read active hospitals" ON hospitals;
CREATE POLICY "Public can read active hospitals" ON hospitals
  FOR SELECT USING (true);

ALTER TABLE specialties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read specialties" ON specialties;
CREATE POLICY "Public can read specialties" ON specialties
  FOR SELECT USING (true);

ALTER TABLE hospital_specialties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read hospital specialties" ON hospital_specialties;
CREATE POLICY "Public can read hospital specialties" ON hospital_specialties
  FOR SELECT USING (true);

ALTER TABLE doctors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read active doctors" ON doctors;
CREATE POLICY "Public can read active doctors" ON doctors
  FOR SELECT USING (true);

ALTER TABLE services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read active services" ON services;
CREATE POLICY "Public can read active services" ON services
  FOR SELECT USING (true);

ALTER TABLE hospital_operating_hours ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read operating hours" ON hospital_operating_hours;
CREATE POLICY "Public can read operating hours" ON hospital_operating_hours
  FOR SELECT USING (true);

-- ── User-scoped tables ────────────────────────────────────────────────────────

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own notifications" ON notifications;
CREATE POLICY "Users can read own notifications" ON notifications
  FOR SELECT USING (
    user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can mark own notifications read" ON notifications;
CREATE POLICY "Users can mark own notifications read" ON notifications
  FOR UPDATE USING (
    user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  );

ALTER TABLE appointment_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Patients can read own appointment documents" ON appointment_documents;
CREATE POLICY "Patients can read own appointment documents" ON appointment_documents
  FOR SELECT USING (
    appointment_id IN (
      SELECT id FROM appointments
      WHERE patient_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    )
  );
