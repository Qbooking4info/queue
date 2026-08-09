-- ── Doctor-initiated referrals ────────────────────────────────────────────
-- A doctor can refer a patient they're seeing to a different hospital (or a
-- specific doctor there) for further care. The resulting appointment lives
-- at the RECEIVING hospital like any other booking (hospital_id/doctor_id
-- point there) -- these three columns are what let the receiving side show
-- who referred the patient and why, separately from the ordinary
-- reason/symptom_description fields a patient fills in themselves.
--
-- referring_hospital_id is denormalised (also derivable via
-- referred_by_doctor_id -> doctors.hospital_id) so the referring hospital's
-- name still displays correctly even if the referring doctor is later
-- deactivated or moves to a different hospital.

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS referred_by_doctor_id  uuid REFERENCES doctors(id),
  ADD COLUMN IF NOT EXISTS referring_hospital_id   uuid REFERENCES hospitals(id),
  ADD COLUMN IF NOT EXISTS referral_reason         text;

CREATE INDEX IF NOT EXISTS idx_appointments_referred_by_doctor ON appointments(referred_by_doctor_id) WHERE referred_by_doctor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_appointments_referring_hospital ON appointments(referring_hospital_id) WHERE referring_hospital_id IS NOT NULL;
