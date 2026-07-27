-- Backfills two policy sets that AUDIT-FINDINGS.md (2026-07-26, Task 3) found
-- were applied directly against production via the dashboard SQL editor and
-- never committed as migrations. supabase/tests/database/rls.test.sql already
-- asserts this exact behavior (Task 3, Task 3d), so a fresh environment /
-- `supabase db reset` currently passes those tests only by luck of matching
-- undocumented prod state. This migration makes that state the tracked
-- source of truth so a reset environment actually reproduces it.
--
-- Definitions below were read directly off the linked production database
-- (pg_policies) on 2026-07-27 and are copied verbatim, not reconstructed.

ALTER TABLE patient_medical_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "patients manage their own medical history" ON patient_medical_history;
CREATE POLICY "patients manage their own medical history" ON patient_medical_history
  FOR ALL
  USING (patient_id IN (SELECT id FROM users WHERE auth_id = auth.uid()))
  WITH CHECK (patient_id IN (SELECT id FROM users WHERE auth_id = auth.uid()));

ALTER TABLE vitals_audit_log ENABLE ROW LEVEL SECURITY;

-- The live "Doctors can read appointment vitals" policy only matched
-- doctors.auth_user_id = auth.uid(). doctors has two identity paths
-- (portal-created doctors link via user_id -> users.auth_id; self-registered
-- ones link directly via auth_user_id -- see web/src/lib/supabase/auth-server.ts
-- and get_doctor_queue, both of which already OR the two together). Copying
-- the live policy verbatim would have backfilled this same gap: any doctor
-- linked only via user_id (auth-server.ts's comment says 6 of 92 in
-- production) could not read their own patients' vitals audit log. Fixed
-- here to match the OR pattern already used everywhere else.
DROP POLICY IF EXISTS "Doctors can read appointment vitals" ON vitals_audit_log;
CREATE POLICY "Doctors can read appointment vitals" ON vitals_audit_log
  FOR SELECT USING (
    appointment_id IN (
      SELECT appointments.id FROM appointments
      WHERE appointments.doctor_id IN (
              SELECT doctors.id FROM doctors
              WHERE doctors.auth_user_id = auth.uid()
                 OR doctors.user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
            )
         OR appointments.assigned_doctor_id IN (
              SELECT doctors.id FROM doctors
              WHERE doctors.auth_user_id = auth.uid()
                 OR doctors.user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
            )
    )
  );

DROP POLICY IF EXISTS "Front desk can read clinic vitals" ON vitals_audit_log;
CREATE POLICY "Front desk can read clinic vitals" ON vitals_audit_log
  FOR SELECT USING (
    appointment_id IN (
      SELECT a.id FROM appointments a
      WHERE a.hospital_id IN (
        SELECT ca.hospital_id FROM clinic_admins ca
        JOIN users u ON u.id = ca.user_id
        WHERE u.auth_id = auth.uid() AND ca.is_active = true
      )
    )
  );
