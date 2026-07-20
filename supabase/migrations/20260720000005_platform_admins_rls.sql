-- ── BL5: Add SELECT RLS policy for platform_admins ───────────────────────────
-- Without this policy, authenticated users cannot read the platform_admins table,
-- which means the client-side role-check pattern fails silently and super_admins
-- cannot verify their own role via direct table access.
--
-- Note: platform_admins.user_id references users.id (the app-level profile UUID),
-- not auth.uid() directly. The USING clause resolves the caller's profile id first.

ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_admin_select_own" ON platform_admins;
CREATE POLICY "platform_admin_select_own" ON platform_admins
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  );
