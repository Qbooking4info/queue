-- ── Audit fixes: schema improvements ─────────────────────────────────────────
-- 1. platform_admins table (replaces users.is_super_admin boolean)
-- 2. admin_audit_log table (NDPR-compliant action log)
-- 3. Composite indexes on appointments
-- 4. Resolve lat/lng vs latitude/longitude duplication
-- 5. hospital_subscriptions lifecycle states (grace_period, suspended)

-- ─── 1. platform_admins — auditable super-admin grant table ───────────────────
-- Replaces the users.is_super_admin boolean which had no audit trail.
CREATE TABLE IF NOT EXISTS platform_admins (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  granted_by   uuid        REFERENCES users(id),
  granted_at   timestamptz NOT NULL DEFAULT now(),
  revoked_at   timestamptz,
  is_active    boolean     NOT NULL DEFAULT true,
  CONSTRAINT platform_admins_user_id_key UNIQUE (user_id)
);

ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;
-- Only service role (admin API routes) can access this table

CREATE INDEX IF NOT EXISTS idx_platform_admins_user ON platform_admins (user_id) WHERE is_active = true;

-- Migrate existing super admins before dropping the column
INSERT INTO platform_admins (user_id, granted_at)
  SELECT id, COALESCE(created_at, now())
  FROM users
  WHERE is_super_admin = true
  ON CONFLICT (user_id) DO NOTHING;

ALTER TABLE users DROP COLUMN IF EXISTS is_super_admin;

-- ─── 2. admin_audit_log — NDPR-compliant record of administrative actions ─────
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_auth_id uuid        NOT NULL,
  actor_role    text        NOT NULL,
  action        text        NOT NULL,
  target_table  text,
  target_id     uuid,
  old_value     jsonb,
  new_value     jsonb,
  ip_address    inet,
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_actor
  ON admin_audit_log (actor_auth_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_target
  ON admin_audit_log (target_table, target_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_time
  ON admin_audit_log (created_at DESC);

ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;
-- No policies: service-role writes only; SELECT via dedicated analytics route

-- ─── 3. Composite indexes on appointments ─────────────────────────────────────
-- Front desk queue: hospital_id + date + status
CREATE INDEX IF NOT EXISTS idx_appointments_hospital_date_status
  ON appointments (hospital_id, appointment_date, status);

-- Clinic queue: clinic-scoped active appointments
CREATE INDEX IF NOT EXISTS idx_appointments_clinic_status
  ON appointments (clinic_id, status)
  WHERE status IN ('pending', 'confirmed', 'checked_in', 'in_progress');

-- Patient history: reverse-chronological per patient
CREATE INDEX IF NOT EXISTS idx_appointments_patient_created
  ON appointments (patient_id, created_at DESC);

-- Doctor schedule: doctor_id + date
CREATE INDEX IF NOT EXISTS idx_appointments_doctor_date
  ON appointments (doctor_id, appointment_date);

-- ─── 4. Resolve lat/lng vs latitude/longitude duplication ─────────────────────
-- Backfill the new columns from legacy values where not already set
UPDATE hospitals
  SET latitude  = lat,
      longitude = lng
  WHERE latitude IS NULL AND lat IS NOT NULL;

-- Drop legacy coordinate columns
ALTER TABLE hospitals
  DROP COLUMN IF EXISTS lat,
  DROP COLUMN IF EXISTS lng;

-- ─── 5. hospital_subscriptions — add lifecycle status values ──────────────────
-- Allow grace_period and suspended in addition to the existing values.
-- No CHECK constraint currently exists on status (column is text), so this
-- is documentation + comment only. The application enforces valid values.
COMMENT ON COLUMN hospital_subscriptions.status IS
  'active | trialing | past_due | grace_period | suspended | cancelled';
