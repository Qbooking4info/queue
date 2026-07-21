-- ── BC4: Fix reviews UPDATE policy (self-referential WITH CHECK) ──────────────
-- The previous "Hospital admins can reply to reviews" policy had
-- WITH CHECK (rating = rating AND patient_id = patient_id … ) which is always
-- true because each column is compared to itself. Replace it with a cleaner
-- SECURITY DEFINER function + BEFORE UPDATE trigger that raises an exception
-- when any immutable field is changed.

-- 1. Drop and recreate the hospital admin UPDATE policy without the bogus WITH CHECK
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
    hospital_id IN (
      SELECT hospital_id FROM hospital_admins
      WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    )
  );

-- 2. BEFORE UPDATE trigger: immutable-field guard
--    Raises an exception if rating, patient_id, doctor_id, or appointment_id change.
CREATE OR REPLACE FUNCTION guard_review_immutable_fields()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.rating         IS DISTINCT FROM OLD.rating         OR
     NEW.patient_id     IS DISTINCT FROM OLD.patient_id     OR
     NEW.doctor_id      IS DISTINCT FROM OLD.doctor_id      OR
     NEW.appointment_id IS DISTINCT FROM OLD.appointment_id
  THEN
    RAISE EXCEPTION
      'rating, patient_id, doctor_id, and appointment_id are immutable on reviews';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_review_immutable ON reviews;
CREATE TRIGGER trg_guard_review_immutable
  BEFORE UPDATE ON reviews
  FOR EACH ROW EXECUTE FUNCTION guard_review_immutable_fields();


-- ── BH11: Fix reviews INSERT policy — verify doctor_id matches appointment's doctor ──
-- The old policy only checked that the appointment belonged to the patient and was
-- completed, but did not verify NEW.doctor_id matches the appointment's actual doctor.
DROP POLICY IF EXISTS "Patients can create reviews" ON reviews;
CREATE POLICY "Patients can create reviews" ON reviews
  FOR INSERT WITH CHECK (
    -- Patient can only review their own appointment
    patient_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    -- doctor_id must exactly match the doctor recorded on the appointment
    AND doctor_id = (
      SELECT doctor_id
      FROM appointments
      WHERE id = appointment_id
        AND patient_id = (SELECT id FROM users WHERE auth_id = auth.uid())
        AND status = 'completed'
    )
  );
