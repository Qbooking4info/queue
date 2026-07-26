-- Task 7 (extended): doctors and hospitals both have an unauthenticated
-- SELECT policy (`is_active = true` / `is_active = true AND is_verified = true`),
-- which is a row-level restriction only -- Postgres RLS cannot restrict
-- columns. Supabase's default schema grants give `anon` table-level SELECT
-- on every table, so anyone holding the public anon key (shipped in the
-- mobile APK) could query PostgREST directly, bypassing whatever column
-- list the Next.js API routes or app code chose, and read:
--   doctors.email          -- login email for the staff portal
--   doctors.auth_user_id   -- internal auth UID
--   doctors.user_id        -- internal user UID
--   doctors.mdcn_number    -- regulatory identifier
--   hospitals.email               -- admin contact email
--   hospitals.registration_number -- regulatory identifier
--   hospitals.mdcn_accreditation  -- regulatory identifier
-- Confirmed live via curl with the anon key before this migration.
--
-- A first attempt at `REVOKE SELECT (col) ON t FROM anon` had no effect:
-- Postgres column ACLs only ever ADD narrower access on top of a broader
-- table-level grant, they cannot subtract from one. Since anon already had
-- unrestricted table-level SELECT, the per-column revoke was a no-op.
-- The correct pattern is to revoke the table-level grant entirely and
-- re-grant SELECT on an explicit column allowlist.
--
-- The allowlist below covers every column the public app code (Next.js
-- public hospital routes, mobile's direct-Supabase fallback queries) reads
-- or filters/joins on for `anon`, matching web/src/lib/public-hospital-select.ts
-- and mobile/lib/api.ts. `authenticated` and `service_role` keep full
-- table-level SELECT untouched -- logged-in staff still see full records.
--
-- Note for future schema changes: because this replaces the table-level
-- grant with a column allowlist, a column added later via ALTER TABLE is
-- NOT automatically visible to anon (default privileges only fire at
-- CREATE TABLE time). Adding a new public-facing column requires an
-- explicit `GRANT SELECT (new_col) ON <table> TO anon` migration.

REVOKE SELECT ON doctors FROM anon;
GRANT SELECT (
  id, full_name, title, qualification, bio, avatar_url,
  years_experience, consultation_fee, virtual_fee, accepts_virtual,
  avg_rating, review_count, availability_status,
  is_active, hospital_id, specialty_id
) ON doctors TO anon;

REVOKE SELECT ON hospitals FROM anon;
GRANT SELECT (
  id, name, slug, address, city, state, country, phone, whatsapp,
  type, description, logo_url, cover_url, latitude, longitude,
  accepts_virtual, emergency_hours, opd_fee, avg_rating, review_count,
  is_verified, is_24_hours, daily_booking_limit, approval_mode,
  requires_referral, clinic_model, is_active
) ON hospitals TO anon;
