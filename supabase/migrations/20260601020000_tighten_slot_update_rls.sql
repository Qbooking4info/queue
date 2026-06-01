-- Tighten time_slots UPDATE policy so patients can only increment the booked_count
-- on a slot they have an active pending appointment for — prevents malicious users
-- from filling up arbitrary slots.

DROP POLICY IF EXISTS "Patients can update slot booking count" ON time_slots;

CREATE POLICY "Patients can update own booked slot count"
  ON time_slots FOR UPDATE
  USING (
    is_available = true
    AND id IN (
      SELECT slot_id FROM appointments
      WHERE patient_id = (SELECT id FROM users WHERE auth_id = auth.uid())
        AND status = 'pending'
        AND slot_id IS NOT NULL
    )
  )
  WITH CHECK (true);
