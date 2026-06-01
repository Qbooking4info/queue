-- Users table RLS: patients need to read/write their own row.
-- Without these, the appointment INSERT RLS subquery returns null for every patient,
-- blocking all bookings, and the registration profile insert fails silently.

-- RLS is already enabled on this table; just add the missing policies.

DROP POLICY IF EXISTS "Users can read own profile" ON users;
CREATE POLICY "Users can read own profile" ON users
  FOR SELECT USING (auth_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own profile" ON users;
CREATE POLICY "Users can insert own profile" ON users
  FOR INSERT WITH CHECK (auth_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own profile" ON users;
CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (auth_id = auth.uid());
