-- clinic_admins had RLS enabled but no SELECT policy, so mobile clients
-- (which use the user session, not service role) could never read staff rows.

CREATE POLICY "Staff can read own clinic_admin row"
  ON clinic_admins FOR SELECT
  USING (
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
  );
