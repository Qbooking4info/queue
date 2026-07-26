-- Task 7 (extended), first attempt -- SUPERSEDED, kept for migration history
-- integrity (already applied to the remote database; do not delete).
--
-- REVOKE SELECT (col) ON table FROM role has no effect when that role
-- already holds unrestricted table-level SELECT: Postgres column ACLs can
-- only grant narrower access on top of a broader grant, they cannot
-- subtract from it. anon already had table-level SELECT on both doctors
-- and hospitals (Supabase's default schema grant), so both statements
-- below executed without error but changed nothing -- confirmed via curl
-- against the anon key immediately after applying.
--
-- See 20260726000004_column_privacy_doctors_hospitals_v2.sql for the
-- corrected fix (revoke table-level SELECT entirely, then grant SELECT on
-- an explicit column allowlist).

REVOKE SELECT (email, auth_user_id, user_id, mdcn_number) ON doctors FROM anon;
REVOKE SELECT (email, registration_number, mdcn_accreditation) ON hospitals FROM anon;
