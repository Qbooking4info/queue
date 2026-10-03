-- Lets a doctor book a patient's next appointment at the same hospital/clinic
-- directly from the consult screen, instead of asking the patient to book it
-- themselves later (which the audit flagged as a real drop-off point for
-- continuity of care). The new appointment is a normal row -- same triggers,
-- same queue -- just inserted by the doctor's own server route rather than
-- the patient's client-side insert, since appointments_patient_insert's RLS
-- (patient_id IN current_patient_ids()) would otherwise reject a doctor
-- inserting on someone else's behalf.
--
-- follow_up_of_appointment_id is nullable and only for traceability/display
-- (e.g. "Follow-up to your visit on 12 Sep") -- nothing enforces or reads it
-- structurally, so a null value (every appointment before this migration)
-- is exactly as valid as a populated one.
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS follow_up_of_appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL;
