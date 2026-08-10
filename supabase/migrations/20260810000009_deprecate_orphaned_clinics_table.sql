-- Queue — close off the orphaned `clinics` table
--
-- `clinics` is superseded by `hospital_clinics` and is completely unreferenced:
--
--   clinics           13 rows,  0 code references
--   hospital_clinics   9 rows, 13 files reference it
--
-- (The single grep hit for 'clinics' in the codebase is a React list key in the
-- onboarding wizard, not a query.) No inbound foreign keys point at it.
--
-- Two problems: it was readable by anon, and it holds stale rows that look real
-- enough to mislead whoever next greps for "clinic".
--
-- This migration fixes the exposure but deliberately does NOT drop the table.
-- Revoking access removes the entire security concern; dropping it destroys 13
-- rows of production data irreversibly for no additional safety. That call needs
-- a human who knows whether anything outside this repository — a report, an
-- export, an analytics job — still reads it.
--
-- To finish the cleanup once that is confirmed:
--     drop table public.clinics;

revoke all on public.clinics from anon, authenticated;

alter table public.clinics enable row level security;

comment on table public.clinics is
  'DEPRECATED 2026-08-10 — superseded by hospital_clinics, which is what all application code uses. Retained only because dropping it would destroy production rows; confirm no external consumer, then drop. Access revoked from anon/authenticated.';
