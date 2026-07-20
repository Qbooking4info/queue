-- ── Audit fixes: RLS policy gaps ─────────────────────────────────────────────
-- Addresses: hospitals exposure of unverified rows, doctors exposure of inactive
-- rows, missing appointment policies for doctors/front_desk, missing vitals_audit_log
-- SELECT policies, missing public reviews policy, missing hospital_clinics policies,
-- active-only filter on availability_templates, booking_ref unique constraint,
-- and approval_status terminal guard.

-- ─── 1. hospitals — only verified + active hospitals are publicly readable ────
DROP POLICY IF EXISTS "Public can read active hospitals" ON hospitals;
DROP POLICY IF EXISTS "Public can read verified active hospitals" ON hospitals;
CREATE POLICY "Public can read verified active hospitals" ON hospitals
  FOR SELECT USING (is_active = true AND is_verified = true);

-- ─── 2. doctors — only active doctors are publicly readable ──────────────────
DROP POLICY IF EXISTS "Public can read active doctors" ON doctors;
CREATE POLICY "Public can read active doctors" ON doctors
  FOR SELECT USING (is_active = true);

-- ─── 3. appointments — add doctor + front_desk policies ──────────────────────
-- Doctors can read their own (or assigned) appointments.
-- Front desk (clinic_admins with front_desk role) can manage appointments
-- for their hospital.
DROP POLICY IF EXISTS "Doctors can read own appointments" ON appointments;
CREATE POLICY "Doctors can read own appointments" ON appointments
  FOR SELECT USING (
    doctor_id IN (
      SELECT id FROM doctors WHERE auth_user_id = auth.uid()
    )
    OR
    assigned_doctor_id IN (
      SELECT id FROM doctors WHERE auth_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Front desk can manage clinic appointments" ON appointments;
CREATE POLICY "Front desk can manage clinic appointments" ON appointments
  FOR ALL USING (
    hospital_id IN (
      SELECT hospital_id FROM clinic_admins
      WHERE auth_user_id = auth.uid()
        AND is_active = true
    )
  );

-- ─── 4. vitals_audit_log — SELECT policies for doctors and front desk ─────────
DROP POLICY IF EXISTS "Doctors can read appointment vitals" ON vitals_audit_log;
CREATE POLICY "Doctors can read appointment vitals" ON vitals_audit_log
  FOR SELECT USING (
    appointment_id IN (
      SELECT id FROM appointments
      WHERE doctor_id IN (SELECT id FROM doctors WHERE auth_user_id = auth.uid())
         OR assigned_doctor_id IN (SELECT id FROM doctors WHERE auth_user_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Front desk can read clinic vitals" ON vitals_audit_log;
CREATE POLICY "Front desk can read clinic vitals" ON vitals_audit_log
  FOR SELECT USING (
    appointment_id IN (
      SELECT id FROM appointments
      WHERE hospital_id IN (
        SELECT hospital_id FROM clinic_admins
        WHERE auth_user_id = auth.uid() AND is_active = true
      )
    )
  );

-- ─── 5. reviews — public can read visible reviews ─────────────────────────────
-- Patients could only previously read their OWN reviews; public ratings require
-- reading other patients' reviews where is_visible = true.
DROP POLICY IF EXISTS "Public can read visible reviews" ON reviews;
CREATE POLICY "Public can read visible reviews" ON reviews
  FOR SELECT USING (is_visible = true);

-- ─── 6. hospital_clinics — add missing RLS policies ──────────────────────────
-- Table had RLS enabled but no policies → inaccessible to all anon users.
ALTER TABLE hospital_clinics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read hospital clinics" ON hospital_clinics;
CREATE POLICY "Public can read hospital clinics" ON hospital_clinics
  FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "Hospital admins manage own clinics" ON hospital_clinics;
CREATE POLICY "Hospital admins manage own clinics" ON hospital_clinics
  FOR ALL USING (
    hospital_id IN (
      SELECT hospital_id FROM hospital_admins
      WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    )
  );

-- ─── 7. availability_templates — only active templates publicly visible ────────
DROP POLICY IF EXISTS "Public can read availability templates" ON availability_templates;
CREATE POLICY "Public can read availability templates" ON availability_templates
  FOR SELECT USING (is_active = true);

-- ─── 8. booking_ref unique constraint ────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'appointments_booking_ref_key'
      AND conrelid = 'appointments'::regclass
  ) THEN
    ALTER TABLE appointments ADD CONSTRAINT appointments_booking_ref_key UNIQUE (booking_ref);
  END IF;
END $$;

-- ─── 9. approval_status terminal guard — "rejected" is final ─────────────────
CREATE OR REPLACE FUNCTION guard_approval_status()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.approval_status = 'rejected' AND NEW.approval_status <> OLD.approval_status THEN
    RAISE EXCEPTION 'Appointment approval_status "rejected" is final and cannot be changed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointment_approval_status_guard ON appointments;
CREATE TRIGGER appointment_approval_status_guard
  BEFORE UPDATE OF approval_status ON appointments
  FOR EACH ROW EXECUTE FUNCTION guard_approval_status();
