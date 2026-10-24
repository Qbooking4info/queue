-- The one deliberate exception to keeping clinical documentation as plain
-- free text: after a VIRTUAL consultation (hospital-linked or booked
-- directly with an independent doctor), the doctor can share a short plan
-- with the patient -- diagnosis, investigations, treatment -- visible on the
-- patient's own appointment screen. In-person and home-visit visits are
-- untouched and keep using the existing diagnosis/doctor_notes columns.
--
-- Reuses the existing `diagnosis` column for diagnosis; doctor_notes stays
-- exactly as it is today (general OPD free-text notes). Flat nullable
-- columns, matching how diagnosis/doctor_notes/prescription_url already work
-- on this table -- no new table, no RLS/column-privacy follow-up needed
-- (appointments has no column-privacy grant migration, unlike doctors/
-- hospitals).
alter table appointments
  add column if not exists investigations text,
  add column if not exists treatment_plan text;
