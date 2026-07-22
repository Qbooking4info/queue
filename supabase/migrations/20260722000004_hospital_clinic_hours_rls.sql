-- ── hospital_clinic_hours — RLS was never enabled on this table ──────────────
-- Unlike its sibling hospital_operating_hours (whole-hospital hours), this
-- table stores per-clinic hours for multi-clinic hospitals and had no RLS at
-- all — any anon/authenticated caller could read AND write any hospital's
-- clinic hours directly through the PostgREST API. All current app code goes
-- through the service-role admin client (which bypasses RLS regardless), so
-- this closes a real gap without touching existing behavior.
ALTER TABLE hospital_clinic_hours ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read clinic hours" ON hospital_clinic_hours;
CREATE POLICY "Public can read clinic hours" ON hospital_clinic_hours
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Hospital admins manage own clinic hours" ON hospital_clinic_hours;
CREATE POLICY "Hospital admins manage own clinic hours" ON hospital_clinic_hours
  FOR ALL USING (
    clinic_id IN (
      SELECT hc.id FROM hospital_clinics hc
      JOIN hospital_admins ha ON ha.hospital_id = hc.hospital_id
      WHERE ha.user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    )
  );
