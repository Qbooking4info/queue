-- "Doctors can read own appointments" (20260719000002) only matched
-- doctor_id/assigned_doctor_id against doctors.auth_user_id = auth.uid().
-- doctors has two identity paths (portal-created doctors link via
-- user_id -> users.auth_id; self-registered/live-flow ones link directly via
-- auth_user_id) -- get_doctor_queue and vitals_audit_log's equivalent
-- policies already OR the two together; this one never did, so any
-- user_id-linked doctor could never read their own appointment rows via a
-- direct client query (only through get_doctor_queue, a SECURITY DEFINER
-- RPC that does its own auth check and bypasses this policy entirely).

DROP POLICY IF EXISTS "Doctors can read own appointments" ON appointments;
CREATE POLICY "Doctors can read own appointments" ON appointments
  FOR SELECT USING (
    doctor_id IN (
      SELECT id FROM doctors
      WHERE auth_user_id = auth.uid()
         OR user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    )
    OR
    assigned_doctor_id IN (
      SELECT id FROM doctors
      WHERE auth_user_id = auth.uid()
         OR user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    )
  );
