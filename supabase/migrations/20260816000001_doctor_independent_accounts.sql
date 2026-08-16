-- ── Independent doctor accounts, linkable to multiple hospitals ──────────────
-- Doctors previously only existed as a hospital_admin-created row scoped to one
-- hospital (doctors.hospital_id, NOT NULL). This adds the other half: a doctor can
-- now self-register an independent account (a plain `users` row, same as a patient --
-- what makes someone "a doctor" has always been having a linked `doctors` row, not a
-- flag on `users`) in the new doctors/ app, then link that one account to any number
-- of hospitals. Each hospital link is still a `doctors` row (unchanged shape, so every
-- existing hospital-scoped query/RLS policy keeps working as-is) -- what's new is that
-- the SAME users.id can now legitimately be the user_id on more than one doctors row.
--
-- active_hospital_id records which of a doctor's linked hospitals is "current" --
-- needed because requireRole() (web) and AuthContext (mobile/doctors app) both used to
-- assume exactly one doctors row per identity and fetched it with .single()/
-- .maybeSingle(), which throws once a second row exists. Both were updated to fetch
-- all matching rows and pick by this column, falling back to the earliest-linked row
-- if it's unset or points at a hospital the doctor has since unlinked from.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS active_hospital_id uuid REFERENCES hospitals(id);

CREATE INDEX IF NOT EXISTS idx_users_active_hospital ON users(active_hospital_id) WHERE active_hospital_id IS NOT NULL;

-- A doctor picking their own active hospital, or updating it as a side effect of
-- linking to a new one, is a self-service action -- not covered by the admin-only
-- "hospital_admins/clinic_admins manage this hospital's users" policies elsewhere,
-- and users already has no general self-update policy for this app's own columns
-- (profile edits go through the service-role API, not a direct client update). This
-- is scoped narrowly: a user may only ever point active_hospital_id at a hospital
-- they actually have an active doctors-row link to.
DROP POLICY IF EXISTS "Users can set their own active hospital" ON users;
CREATE POLICY "Users can set their own active hospital" ON users
  FOR UPDATE
  USING (auth_id = auth.uid())
  WITH CHECK (
    auth_id = auth.uid()
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
