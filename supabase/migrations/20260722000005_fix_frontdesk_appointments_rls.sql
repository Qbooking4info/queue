-- Fix: front desk appointments policy was checking clinic_admins.auth_user_id
-- which is always NULL. Correct join goes through the users table.

DROP POLICY IF EXISTS "Front desk can manage clinic appointments" ON appointments;

CREATE POLICY "Front desk can manage clinic appointments" ON appointments
  FOR ALL USING (
    hospital_id IN (
      SELECT hospital_id FROM clinic_admins
      WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
        AND is_active = true
    )
  );
