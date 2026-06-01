-- Dependents table RLS: users can manage only their own dependents.
ALTER TABLE dependents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own dependents" ON dependents;
CREATE POLICY "Users can read own dependents" ON dependents
  FOR SELECT USING (
    user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can insert own dependents" ON dependents;
CREATE POLICY "Users can insert own dependents" ON dependents
  FOR INSERT WITH CHECK (
    user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can update own dependents" ON dependents;
CREATE POLICY "Users can update own dependents" ON dependents
  FOR UPDATE USING (
    user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can delete own dependents" ON dependents;
CREATE POLICY "Users can delete own dependents" ON dependents
  FOR DELETE USING (
    user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  );
