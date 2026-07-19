-- Vitals audit log: records every time vitals are saved for an appointment.
-- Allows reviewing who captured vitals and when, and detecting edits.
-- Writes are done by the service role (bypasses RLS); no client access needed yet.

CREATE TABLE IF NOT EXISTS vitals_audit_log (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id   uuid NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  recorded_by_auth_id uuid,
  recorded_at      timestamptz NOT NULL DEFAULT now(),
  weight_kg        double precision,
  height_cm        double precision,
  bp_systolic      integer,
  bp_diastolic     integer,
  blood_sugar      double precision,
  bmi              double precision
);

CREATE INDEX IF NOT EXISTS vitals_audit_log_appointment_idx ON vitals_audit_log (appointment_id, recorded_at DESC);

ALTER TABLE vitals_audit_log ENABLE ROW LEVEL SECURITY;
-- Service role writes bypass RLS; SELECT policies can be added when a UI is built.
