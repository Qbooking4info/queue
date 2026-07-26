-- Add 24/7 service flag to hospitals.
-- When true, the hospital is open around the clock on all days.
-- Mobile booking flow skips operating-hours checks for this hospital.

ALTER TABLE hospitals ADD COLUMN IF NOT EXISTS is_24_hours boolean NOT NULL DEFAULT false;
