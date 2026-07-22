-- ── Add missing is_emergency column to hospital_clinics ──────────────────────
-- The dashboard's "Set as Emergency Dept" button (clinics/[clinicId]/page.tsx)
-- and admin-api.ts's setEmergencyClinic()/clearEmergencyClinic() have always
-- referenced this column, but no migration ever created it — every click on
-- that button was failing with a Postgres "column does not exist" error.

ALTER TABLE hospital_clinics
  ADD COLUMN IF NOT EXISTS is_emergency BOOLEAN NOT NULL DEFAULT false;

-- Enforce "at most one Emergency Department clinic per hospital" at the DB
-- level as well as in application logic (setEmergencyClinic already clears
-- the previous holder before setting the new one, but a partial unique index
-- closes any race-condition gap).
CREATE UNIQUE INDEX IF NOT EXISTS hospital_clinics_one_emergency_per_hospital
  ON hospital_clinics (hospital_id)
  WHERE is_emergency = true;
