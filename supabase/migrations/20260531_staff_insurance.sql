-- ============================================================
-- Migration: staff roles + user_insurance table
-- Run this in your Supabase SQL Editor
-- ============================================================

-- 1. Update existing 'owner' roles to 'admin' for consistency
UPDATE hospital_admins SET role = 'admin' WHERE role = 'owner';

-- 2. Create user_insurance table (used by mobile Insurance screen)
CREATE TABLE IF NOT EXISTS user_insurance (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider     text NOT NULL,
  plan_name    text,
  member_id    text NOT NULL,
  group_number text,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now(),
  UNIQUE (user_id)
);

-- RLS
ALTER TABLE user_insurance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own insurance"
  ON user_insurance FOR ALL
  USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()))
  WITH CHECK (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

-- 3. Ensure users.auth_id has a unique constraint (needed for upsert in staff accept flow)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_auth_id_key' AND conrelid = 'users'::regclass
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_auth_id_key UNIQUE (auth_id);
  END IF;
END $$;
