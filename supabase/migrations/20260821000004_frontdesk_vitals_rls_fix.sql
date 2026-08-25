-- "Front desk can read clinic vitals" on vitals_audit_log has only ever matched
-- through clinic_admins (a clinic-scoped front-desk account). A hospital-wide
-- front-desk account -- hospital_admins.role = 'front_desk', the same role
-- requireRole(['front_desk']) already recognises everywhere else in the app --
-- has never had a matching policy, so that account type cannot read the vitals
-- audit log at all. Confirmed by reading 20260726000005_clinic_admins_collapse_prep.sql
-- and 20260727000003_backfill_untracked_policies.sql directly: both prior
-- rewrites of this policy kept it clinic_admins-only. This becomes a real,
-- user-visible gap now that front desk gets a live vitals widget on the queue
-- screen (mobile/screens/frontdesk/FrontDeskQueueScreen.tsx).

DROP POLICY IF EXISTS "Front desk can read clinic vitals" ON vitals_audit_log;

CREATE POLICY "Front desk can read clinic vitals"
  ON vitals_audit_log FOR SELECT
  USING (
    appointment_id IN (
      SELECT a.id FROM appointments a
      WHERE a.hospital_id IN (
        SELECT ca.hospital_id FROM clinic_admins ca
        JOIN users u ON u.id = ca.user_id
        WHERE u.auth_id = auth.uid() AND ca.is_active = true
        UNION
        SELECT ha.hospital_id FROM hospital_admins ha
        JOIN users u ON u.id = ha.user_id
        WHERE u.auth_id = auth.uid() AND ha.role = 'front_desk' AND ha.is_active = true
      )
    )
  );
