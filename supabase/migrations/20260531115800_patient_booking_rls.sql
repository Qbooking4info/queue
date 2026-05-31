-- Allow patients (authenticated users) to read available time slots
ALTER TABLE time_slots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read available slots" ON time_slots;
CREATE POLICY "Public can read available slots"
  ON time_slots FOR SELECT
  USING (is_available = true);

DROP POLICY IF EXISTS "Hospital admins manage slots" ON time_slots;
CREATE POLICY "Hospital admins manage slots"
  ON time_slots FOR ALL
  USING (
    hospital_id IN (
      SELECT hospital_id FROM hospital_admins
      WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    )
  );

-- Allow authenticated patients to create appointments for themselves
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Patients can create their own appointments" ON appointments;
CREATE POLICY "Patients can create their own appointments"
  ON appointments FOR INSERT
  WITH CHECK (
    patient_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  );

DROP POLICY IF EXISTS "Patients can view their own appointments" ON appointments;
CREATE POLICY "Patients can view their own appointments"
  ON appointments FOR SELECT
  USING (
    patient_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  );

DROP POLICY IF EXISTS "Hospital admins manage their appointments" ON appointments;
CREATE POLICY "Hospital admins manage their appointments"
  ON appointments FOR ALL
  USING (
    hospital_id IN (
      SELECT hospital_id FROM hospital_admins
      WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Patients can update slot booking count" ON time_slots;
CREATE POLICY "Patients can update slot booking count"
  ON time_slots FOR UPDATE
  USING (is_available = true)
  WITH CHECK (true);
