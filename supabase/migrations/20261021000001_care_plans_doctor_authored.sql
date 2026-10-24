-- Care plans move from the hospital desk to the consultation.
--
-- A plan is now written by the doctor seeing the patient, whether they are
-- working at a hospital or booked directly as an independent. That second case
-- has no hospital at all, so hospital_id can no longer be required.
--
-- The existing read policy is unaffected: a patient reaches their plans through
-- patient_id (current_patient_ids()), not through the hospital, so a plan with
-- no hospital stays visible to the patient it belongs to. Hospital staff keep
-- reading the plans written at their hospital through the same policy's second
-- branch; a null hospital_id simply never matches it, which is correct -- an
-- independent doctor's plan is not the hospital's to read.

ALTER TABLE care_plans ALTER COLUMN hospital_id DROP NOT NULL;

COMMENT ON COLUMN care_plans.hospital_id IS
  'The hospital the plan was written at, or NULL when an independent doctor '
  'wrote it during a direct booking. Set from the treating doctor''s link, '
  'never from client input.';

-- doctor_id was already nullable because a hospital could write a plan with no
-- named doctor. Now that plans are authored in a consultation there is always a
-- doctor, but leaving it nullable keeps the three existing rows valid.
