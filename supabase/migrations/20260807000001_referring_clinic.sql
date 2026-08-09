-- ── Referring clinic ──────────────────────────────────────────────────────
-- Follow-up to 20260803000001_doctor_referrals.sql (referred_by_doctor_id /
-- referring_hospital_id / referral_reason). The receiving side asked to see
-- not just which hospital a referral came from but which clinic/department --
-- denormalised the same way and for the same reason: referred_by_doctor_id's
-- own clinic_id can change later (the doctor moves clinics, or is
-- deactivated), so this is captured at referral time, not derived via a join.

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS referring_clinic_id uuid REFERENCES hospital_clinics(id);

CREATE INDEX IF NOT EXISTS idx_appointments_referring_clinic ON appointments(referring_clinic_id) WHERE referring_clinic_id IS NOT NULL;
