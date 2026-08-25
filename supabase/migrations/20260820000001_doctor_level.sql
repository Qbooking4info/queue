-- ── Doctor cadre/level ─────────────────────────────────────────────────────
-- A doctor's professional rank (Consultant, Senior Registrar, Registrar,
-- Senior Medical Officer, Medical Officer, House Officer/Intern, etc.) --
-- self-declared by the doctor, same as specialty. Free text, not an enum:
-- matches the existing convention for title/qualification on both tables
-- (no CHECK constraint), and the set of real-world cadre titles varies by
-- hospital and isn't this app's to enumerate exhaustively.
--
-- Stored on BOTH doctors (hospital-scoped) and doctor_profiles (identity-
-- scoped), mirroring the existing duplication of title/qualification/bio/
-- years_experience/specialty_id across these two tables -- doctors is what
-- every hospital-context read (dashboard doctor cards, patient-facing
-- hospital profile) already queries directly with zero joins; doctor_profiles
-- is what the doctors app's own Settings screen and direct-booking discovery
-- read. POST /api/doctors/link already carries qualification/bio/etc forward
-- from a doctor's existing doctors row when linking to a new hospital --
-- level is added to that same carry-forward list.

ALTER TABLE doctors ADD COLUMN IF NOT EXISTS level text;
ALTER TABLE doctor_profiles ADD COLUMN IF NOT EXISTS level text;
