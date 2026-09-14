-- The consult screen's Diagnosis/Investigations/Plan sections are moving from a
-- single free-text field each to a repeatable item list (see
-- PatientConsultScreen.tsx), and picking up a fourth section, Prescription,
-- that had no column at all. diagnosis/investigations/treatment_plan already
-- exist (20260911000002_virtual_consultation_plan.sql) and keep being plain
-- text -- each list is stored newline-joined, one item per line, so every
-- existing reader (patient AppointmentDetailScreen, web dashboard) keeps
-- working unchanged and a pre-existing single-line value just renders as a
-- one-item list.
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS prescription text;
