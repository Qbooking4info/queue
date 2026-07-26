-- Index foreign key / status columns that had no index anywhere in migration
-- history. Postgres does not auto-index FKs (only PK/unique), so these were
-- doing sequential scans on the booking, billing, and notification read paths.

-- time_slots: booking-flow read path
CREATE INDEX IF NOT EXISTS idx_time_slots_hospital ON time_slots (hospital_id);
CREATE INDEX IF NOT EXISTS idx_time_slots_doctor ON time_slots (doctor_id);

-- payments: billing lookups + status filtering
CREATE INDEX IF NOT EXISTS idx_payments_appointment ON payments (appointment_id);
CREATE INDEX IF NOT EXISTS idx_payments_patient ON payments (patient_id);
CREATE INDEX IF NOT EXISTS idx_payments_hospital_status ON payments (hospital_id, status);

-- doctors: directory/search queries
CREATE INDEX IF NOT EXISTS idx_doctors_hospital ON doctors (hospital_id);
CREATE INDEX IF NOT EXISTS idx_doctors_clinic ON doctors (clinic_id);
CREATE INDEX IF NOT EXISTS idx_doctors_specialty ON doctors (specialty_id);

-- notifications: notification-bell reads
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id, created_at DESC);

-- reviews
CREATE INDEX IF NOT EXISTS idx_reviews_patient ON reviews (patient_id);
CREATE INDEX IF NOT EXISTS idx_reviews_doctor ON reviews (doctor_id);
CREATE INDEX IF NOT EXISTS idx_reviews_hospital ON reviews (hospital_id);
-- appointment_id already has a unique constraint (one review per appointment),
-- which Postgres backs with an index automatically.

-- virtual_sessions: video call lookups
CREATE INDEX IF NOT EXISTS idx_virtual_sessions_status ON virtual_sessions (status);
-- appointment_id already has a unique constraint, indexed automatically.

-- dependents
CREATE INDEX IF NOT EXISTS idx_dependents_user ON dependents (user_id);

-- hospital_clinics
CREATE INDEX IF NOT EXISTS idx_hospital_clinics_hospital ON hospital_clinics (hospital_id);

-- appointment_documents
CREATE INDEX IF NOT EXISTS idx_appointment_documents_appointment ON appointment_documents (appointment_id);
CREATE INDEX IF NOT EXISTS idx_appointment_documents_uploaded_by ON appointment_documents (uploaded_by);

-- payouts
CREATE INDEX IF NOT EXISTS idx_payouts_hospital_status ON payouts (hospital_id, status);

-- hospital_subscriptions: plan_id lookup (hospital_id already unique/indexed)
CREATE INDEX IF NOT EXISTS idx_hospital_subscriptions_plan ON hospital_subscriptions (plan_id);

-- slot_overrides
CREATE INDEX IF NOT EXISTS idx_slot_overrides_doctor ON slot_overrides (doctor_id);
