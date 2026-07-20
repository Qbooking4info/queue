-- ── Audit fix: normalize vitals out of appointments ──────────────────────────
-- The appointments table had vitals columns (weight, height, BP, blood sugar,
-- BMI, recorded_at) duplicating what is now in vitals_audit_log. This migration
-- drops those denormalized columns. The application reads vitals by querying
-- vitals_audit_log directly (batch lookup by appointment_id).
--
-- IMPORTANT: Deploy this migration atomically with the corresponding
-- admin-api.ts changes that remove vitals writes to appointments and update
-- all SELECT queries to fetch vitals from vitals_audit_log.

ALTER TABLE appointments
  DROP COLUMN IF EXISTS vitals_weight_kg,
  DROP COLUMN IF EXISTS vitals_height_cm,
  DROP COLUMN IF EXISTS vitals_bp_systolic,
  DROP COLUMN IF EXISTS vitals_bp_diastolic,
  DROP COLUMN IF EXISTS vitals_blood_sugar,
  DROP COLUMN IF EXISTS vitals_bmi,
  DROP COLUMN IF EXISTS vitals_recorded_at;

-- Convenience view: latest vitals per appointment joined to the base row.
-- Useful for direct Supabase queries from client apps.
CREATE OR REPLACE VIEW appointments_with_vitals AS
SELECT
  a.*,
  v.weight_kg    AS vitals_weight_kg,
  v.height_cm    AS vitals_height_cm,
  v.bp_systolic  AS vitals_bp_systolic,
  v.bp_diastolic AS vitals_bp_diastolic,
  v.blood_sugar  AS vitals_blood_sugar,
  v.bmi          AS vitals_bmi,
  v.recorded_at  AS vitals_recorded_at,
  v.recorded_by_auth_id AS vitals_recorded_by_auth_id
FROM appointments a
LEFT JOIN LATERAL (
  SELECT weight_kg, height_cm, bp_systolic, bp_diastolic,
         blood_sugar, bmi, recorded_at, recorded_by_auth_id
  FROM vitals_audit_log
  WHERE appointment_id = a.id
  ORDER BY recorded_at DESC
  LIMIT 1
) v ON true;
