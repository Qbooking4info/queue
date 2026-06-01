-- 1. Tighten the hospital admin UPDATE policy on reviews so only hospital_reply
--    and replied_at can be changed — prevents admins from editing ratings.
DROP POLICY IF EXISTS "Hospital admins can reply to reviews" ON reviews;
CREATE POLICY "Hospital admins can reply to reviews" ON reviews
  FOR UPDATE
  USING (
    hospital_id IN (
      SELECT hospital_id FROM hospital_admins
      WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    )
  )
  WITH CHECK (
    -- All immutable fields must remain unchanged
    hospital_id = hospital_id AND
    doctor_id   = doctor_id   AND
    patient_id  = patient_id  AND
    rating      = rating      AND
    body        = body        AND
    appointment_id = appointment_id
  );

-- 2. Prevent a patient from submitting more than one review per appointment.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reviews_appointment_id_patient_id_key'
      AND conrelid = 'reviews'::regclass
  ) THEN
    ALTER TABLE reviews
      ADD CONSTRAINT reviews_appointment_id_patient_id_key
      UNIQUE (appointment_id, patient_id);
  END IF;
END $$;
