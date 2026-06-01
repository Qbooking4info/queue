-- 1. Cascade-delete appointment_documents and virtual_sessions when their
--    appointment is deleted.
ALTER TABLE appointment_documents
  DROP CONSTRAINT IF EXISTS appointment_documents_appointment_id_fkey,
  ADD CONSTRAINT appointment_documents_appointment_id_fkey
    FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE;

ALTER TABLE virtual_sessions
  DROP CONSTRAINT IF EXISTS virtual_sessions_appointment_id_fkey,
  ADD CONSTRAINT virtual_sessions_appointment_id_fkey
    FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE;

-- 2. Composite index on hospital_admins(user_id, hospital_id) — every admin
--    RLS subquery uses both columns.
CREATE INDEX IF NOT EXISTS idx_hospital_admins_user_hospital
  ON hospital_admins (user_id, hospital_id);

-- 3. Index on hospital_admins(hospital_id) for hospital-scoped lookups.
CREATE INDEX IF NOT EXISTS idx_hospital_admins_hospital
  ON hospital_admins (hospital_id);
