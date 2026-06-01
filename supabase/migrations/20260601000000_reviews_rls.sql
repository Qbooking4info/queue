-- Reviews table RLS: patients can read their own reviews and create reviews
-- for appointments they attended. Hospitals can read reviews for their doctors.

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Patients can read own reviews" ON reviews;
CREATE POLICY "Patients can read own reviews" ON reviews
  FOR SELECT USING (
    patient_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  );

DROP POLICY IF EXISTS "Patients can create reviews" ON reviews;
CREATE POLICY "Patients can create reviews" ON reviews
  FOR INSERT WITH CHECK (
    patient_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    AND appointment_id IN (
      SELECT id FROM appointments
      WHERE patient_id = (SELECT id FROM users WHERE auth_id = auth.uid())
        AND status = 'completed'
    )
  );

DROP POLICY IF EXISTS "Hospital admins can read their hospital reviews" ON reviews;
CREATE POLICY "Hospital admins can read their hospital reviews" ON reviews
  FOR SELECT USING (
    hospital_id IN (
      SELECT hospital_id FROM hospital_admins
      WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Hospital admins can reply to reviews" ON reviews;
CREATE POLICY "Hospital admins can reply to reviews" ON reviews
  FOR UPDATE USING (
    hospital_id IN (
      SELECT hospital_id FROM hospital_admins
      WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    )
  );
