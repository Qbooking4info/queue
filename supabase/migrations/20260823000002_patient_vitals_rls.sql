-- vitals_audit_log has RLS enabled (20260719000000) but only doctor and
-- front-desk SELECT policies were ever added -- confirmed no patient policy
-- exists at all. This is also why the patient-facing "Vitals recorded during
-- visit" section (mobile/screens/AppointmentDetailScreen.tsx) has been
-- silently dead since the denormalised appointments.vitals_* columns were
-- dropped (20260719000004_normalize_vitals.sql): it read columns that no
-- longer exist, and even fixed to read vitals_audit_log directly, RLS would
-- have filtered every row out anyway with no error.

CREATE POLICY "Patients can read own vitals" ON vitals_audit_log
  FOR SELECT USING (
    appointment_id IN (
      SELECT id FROM appointments
      WHERE patient_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    )
  );
