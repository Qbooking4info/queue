-- ── BL2: Add is_active column to hospital_admins ─────────────────────────────
-- Allows individual hospital admin accounts to be deactivated without deleting
-- the row (preserves audit trail). The requireRole function in auth-server.ts
-- already filters by .eq('is_active', true) so this column takes effect immediately.

ALTER TABLE hospital_admins
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Index for the common query pattern: WHERE user_id = $1 AND is_active = true
CREATE INDEX IF NOT EXISTS hospital_admins_user_active_idx
  ON hospital_admins (user_id, is_active)
  WHERE is_active = true;
