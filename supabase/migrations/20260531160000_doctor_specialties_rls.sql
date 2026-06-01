ALTER TABLE doctor_specialties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read doctor specialties" ON doctor_specialties;
CREATE POLICY "Public can read doctor specialties" ON doctor_specialties
  FOR SELECT USING (true);
