-- "Where am I signed in?" had no answer.
--
-- The patient app's privacy screen was designed with a list of signed-in
-- devices and a way to end the other ones. Supabase keeps its sessions in the
-- auth schema, which clients cannot read, so the screen had nothing to list
-- and the feature was left out.
--
-- This records the devices themselves, which is the half Queue can honestly
-- own. Note what it deliberately does NOT claim: a row here is not a session,
-- and deleting one does not sign that phone out. Ending other sessions is
-- supabase.auth.signOut({ scope: 'others' }), which is all-or-nothing by
-- design -- so the app offers exactly that, rather than a per-row "revoke"
-- button that would quietly do nothing.

CREATE TABLE IF NOT EXISTS user_devices (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Stable per-install identifier generated on the device, not a hardware id:
  -- Queue has no need to know which physical handset this is, only that it is
  -- the same install as last week.
  install_id    text NOT NULL,
  label         text,
  platform      text CHECK (platform IS NULL OR platform IN ('ios', 'android', 'web')),
  app           text CHECK (app IS NULL OR app IN ('patient', 'doctor', 'hospital', 'ambulance')),
  app_version   text,
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, install_id)
);

COMMENT ON TABLE user_devices IS
  'Devices a user has opened Queue on. NOT a session table: a row here does not grant access and removing one does not sign anything out. It exists so the privacy screen can say where the account has been used, and when.';
COMMENT ON COLUMN user_devices.install_id IS
  'Random id generated once per install and kept in local storage. Not a hardware identifier -- deliberately, so this cannot be used to recognise a person across accounts.';

CREATE INDEX IF NOT EXISTS user_devices_user_idx ON user_devices (user_id, last_seen_at DESC);

ALTER TABLE user_devices ENABLE ROW LEVEL SECURITY;

-- Strictly your own. No staff or support read path: this is a privacy
-- feature, and a support console that can see where a patient has been signed
-- in is the opposite of one.
DROP POLICY IF EXISTS "Users manage own devices" ON user_devices;
CREATE POLICY "Users manage own devices" ON user_devices
  FOR ALL
  USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()))
  WITH CHECK (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

-- Verification (read-only; run after applying)
--   select count(*) from user_devices;   -- 0
--   select relrowsecurity from pg_class where relname = 'user_devices';  -- true
