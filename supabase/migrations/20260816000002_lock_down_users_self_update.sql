-- ── Close a privilege-escalation hole on `users` ──────────────────────────────
-- `20260531130000_users_rls.sql` added:
--   CREATE POLICY "Users can update own profile" ON users
--     FOR UPDATE USING (auth_id = auth.uid())
-- with no WITH CHECK, and the pre-existing INSERT policy WITH CHECK (auth_id =
-- auth.uid()) has the same gap. Postgres RLS policies only gate which ROWS are
-- readable/writable, not which COLUMNS -- and Supabase's default schema grants
-- give `authenticated` unrestricted table-level INSERT/UPDATE on every table.
-- Combined, any signed-in user could currently run, straight against
-- PostgREST with nothing but their own session token:
--   supabase.from('users').update({ is_super_admin: true }).eq('id', me)
-- and grant themselves platform-wide super_admin -- or silently rewrite their
-- own patient_number, is_verified, or (pre-this-migration's auth_id pin
-- below) hijack another not-yet-registered user's identity by pre-claiming
-- their future auth_id.
--
-- Unlike `.update()`, direct client inserts/upserts on `users` ARE used by
-- three legitimate onboarding flows -- web/src/app/register/page.tsx and
-- web/src/app/staff/accept/page.tsx (`{ auth_id, full_name, email }`), and
-- doctors/contexts/AuthContext.tsx's signUp() (`{ auth_id, email, full_name,
-- phone }`). So this can't just revoke INSERT outright the way the
-- doctors/hospitals SELECT column-privacy fix (20260726000004) did; it has
-- to allow exactly the columns those three flows use and nothing else, and
-- constrain their *values* via WITH CHECK since column grants alone can't
-- stop a client writing its own row's auth_id to someone else's, or its
-- email to an address it doesn't own.

REVOKE INSERT ON users FROM authenticated, anon;
GRANT INSERT (auth_id, full_name, email, phone) ON users TO authenticated;

REVOKE UPDATE ON users FROM authenticated, anon;
GRANT UPDATE (
  full_name, phone, date_of_birth, gender, blood_group,
  address, city, state, country, avatar_url, active_hospital_id,
  auth_id, email
) ON users TO authenticated;

-- Deliberately excluded from both allowlists: id, patient_number (system/
-- staff-assigned), is_verified / is_super_admin (trust flags), created_at /
-- updated_at (system-owned).
--
-- auth_id and email stay grantable (the upsert flows above need to be able
-- to send them), but are pinned by WITH CHECK to the caller's own session --
-- auth_id must equal auth.uid() (can never be pointed at another identity)
-- and email must equal the verified email on the caller's own JWT (can never
-- be set to an address that isn't actually theirs, closing the same class of
-- spoofing risk the notify-staff fix closed elsewhere in this app).
--
-- This folds the standalone "Users can set their own active hospital" policy
-- (added by 20260816000001) into this one UPDATE policy and drops it.
-- Postgres OR's every applicable permissive RLS policy together for a given
-- command -- an UPDATE only needs ONE policy's WITH CHECK to pass. Leaving
-- that narrower policy in place alongside this one would let it silently
-- authorize writes to auth_id/email that this policy's checks are meant to
-- block, since its own WITH CHECK never looks at those columns. One
-- authoritative UPDATE policy avoids that footgun.

DROP POLICY IF EXISTS "Users can set their own active hospital" ON users;

DROP POLICY IF EXISTS "Users can insert own profile" ON users;
CREATE POLICY "Users can insert own profile" ON users
  FOR INSERT WITH CHECK (
    auth_id = auth.uid()
    AND (email IS NULL OR email = (auth.jwt() ->> 'email'))
  );

DROP POLICY IF EXISTS "Users can update own profile" ON users;
CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE USING (auth_id = auth.uid())
  WITH CHECK (
    auth_id = auth.uid()
    AND (email IS NULL OR email = (auth.jwt() ->> 'email'))
    AND (
      active_hospital_id IS NULL
      OR EXISTS (
        SELECT 1 FROM doctors d
        WHERE d.hospital_id = active_hospital_id
          AND d.is_active = true
          AND (d.auth_user_id = auth.uid() OR d.user_id = id)
      )
    )
  );
