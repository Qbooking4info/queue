-- Ensure users.auth_id has a unique constraint (needed for upsert in staff accept flow)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'users_auth_id_key' AND conrelid = 'users'::regclass
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_auth_id_key UNIQUE (auth_id);
  END IF;
END $$;
