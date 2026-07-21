ALTER TABLE patient_medical_history
  ADD COLUMN IF NOT EXISTS other_conditions TEXT;
