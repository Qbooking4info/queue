-- A consultation could record what the doctor thought, but not what they
-- ordered.
--
-- appointments carries diagnosis, investigations and treatment_plan: three
-- free-text fields. A doctor writes "Aspirin 75mg once daily 30 days" into one
-- of them and the system knows nothing -- not that a drug was prescribed, not
-- which one, not for how long, and not whether anybody dispensed it. The
-- patient's app can only show the paragraph back to them.
--
-- Two tables, one row per thing ordered. Deliberately NOT a drug formulary:
-- drug_name is free text, because a dictionary nobody maintains is worse than
-- a field everybody can type into, and the clinical value here is structure
-- (what, how much, how often, how long, has it happened) rather than coding.

-- ---------------------------------------------------------------------------
-- Prescriptions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS prescriptions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id  uuid NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  -- Denormalised so a patient's whole medication history is one query, and so
  -- the row survives for the hospital's records if the appointment is removed
  -- by retention. NULL for a walk-in with no linked account, exactly like
  -- appointments.patient_id.
  patient_id      uuid REFERENCES users(id) ON DELETE SET NULL,
  hospital_id     uuid REFERENCES hospitals(id) ON DELETE SET NULL,
  doctor_id       uuid REFERENCES doctors(id) ON DELETE SET NULL,

  drug_name       text NOT NULL,
  dose            text,
  frequency       text,
  duration_days   smallint CHECK (duration_days IS NULL OR duration_days BETWEEN 1 AND 365),
  quantity        smallint CHECK (quantity IS NULL OR quantity BETWEEN 1 AND 1000),
  instructions    text,

  status          text NOT NULL DEFAULT 'prescribed'
                    CHECK (status IN ('prescribed', 'dispensed', 'cancelled')),
  dispensed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE prescriptions IS
  'One row per drug prescribed at a consultation. Replaces parsing the free-text treatment_plan, which could never be shown as a list or marked dispensed.';
COMMENT ON COLUMN prescriptions.status IS
  'prescribed | dispensed | cancelled. "dispensed" is the pharmacy half -- until something sets it, a prescription is a doctor s intention, and the patient app must not imply they have the drug in hand.';

CREATE INDEX IF NOT EXISTS prescriptions_appointment_idx ON prescriptions (appointment_id);
CREATE INDEX IF NOT EXISTS prescriptions_patient_idx ON prescriptions (patient_id, created_at DESC) WHERE patient_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Test orders
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS test_orders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id  uuid NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  patient_id      uuid REFERENCES users(id) ON DELETE SET NULL,
  hospital_id     uuid REFERENCES hospitals(id) ON DELETE SET NULL,
  doctor_id       uuid REFERENCES doctors(id) ON DELETE SET NULL,

  test_name       text NOT NULL,
  specimen        text,
  instructions    text,
  urgency         text NOT NULL DEFAULT 'routine'
                    CHECK (urgency IN ('routine', 'urgent', 'stat')),

  status          text NOT NULL DEFAULT 'ordered'
                    CHECK (status IN ('ordered', 'collected', 'resulted', 'cancelled')),
  collected_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE test_orders IS
  'One row per investigation ordered at a consultation. The v4 consultation plan shows an "Ordered" state against each test; before this table that pill would have been decoration, since nothing recorded that a laboratory had been told.';

CREATE INDEX IF NOT EXISTS test_orders_appointment_idx ON test_orders (appointment_id);
CREATE INDEX IF NOT EXISTS test_orders_patient_idx ON test_orders (patient_id, created_at DESC) WHERE patient_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS test_orders_open_idx ON test_orders (hospital_id, status) WHERE status IN ('ordered', 'collected');

-- ---------------------------------------------------------------------------
-- Keep updated_at honest
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION touch_clinical_order()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_prescription ON prescriptions;
CREATE TRIGGER touch_prescription BEFORE UPDATE ON prescriptions
  FOR EACH ROW EXECUTE FUNCTION touch_clinical_order();

DROP TRIGGER IF EXISTS touch_test_order ON test_orders;
CREATE TRIGGER touch_test_order BEFORE UPDATE ON test_orders
  FOR EACH ROW EXECUTE FUNCTION touch_clinical_order();

-- ---------------------------------------------------------------------------
-- Who may read and write
-- ---------------------------------------------------------------------------
--
-- Three audiences, the same three the appointment itself has, and written the
-- same way so there is one pattern to understand:
--   the patient (and whoever manages them) reads their own;
--   the treating doctor reads and writes the ones on their own appointments;
--   staff of the hospital read and write their own hospital's.

ALTER TABLE prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_orders   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Patients read own prescriptions" ON prescriptions;
CREATE POLICY "Patients read own prescriptions" ON prescriptions
  FOR SELECT USING (patient_id IN (SELECT current_patient_ids()));

DROP POLICY IF EXISTS "Doctors manage prescriptions on own appointments" ON prescriptions;
CREATE POLICY "Doctors manage prescriptions on own appointments" ON prescriptions
  FOR ALL
  USING (doctor_id IN (SELECT current_doctor_ids()))
  WITH CHECK (doctor_id IN (SELECT current_doctor_ids()));

DROP POLICY IF EXISTS "Hospital staff manage own prescriptions" ON prescriptions;
CREATE POLICY "Hospital staff manage own prescriptions" ON prescriptions
  FOR ALL
  USING (
    hospital_id IN (
      SELECT ha.hospital_id FROM hospital_admins ha JOIN users u ON u.id = ha.user_id
       WHERE u.auth_id = auth.uid() AND ha.is_active AND ha.role <> 'ambulance_crew'
      UNION
      SELECT ca.hospital_id FROM clinic_admins ca JOIN users u ON u.id = ca.user_id
       WHERE u.auth_id = auth.uid() AND ca.is_active
    )
  )
  WITH CHECK (
    hospital_id IN (
      SELECT ha.hospital_id FROM hospital_admins ha JOIN users u ON u.id = ha.user_id
       WHERE u.auth_id = auth.uid() AND ha.is_active AND ha.role <> 'ambulance_crew'
      UNION
      SELECT ca.hospital_id FROM clinic_admins ca JOIN users u ON u.id = ca.user_id
       WHERE u.auth_id = auth.uid() AND ca.is_active
    )
  );

DROP POLICY IF EXISTS "Patients read own test orders" ON test_orders;
CREATE POLICY "Patients read own test orders" ON test_orders
  FOR SELECT USING (patient_id IN (SELECT current_patient_ids()));

DROP POLICY IF EXISTS "Doctors manage test orders on own appointments" ON test_orders;
CREATE POLICY "Doctors manage test orders on own appointments" ON test_orders
  FOR ALL
  USING (doctor_id IN (SELECT current_doctor_ids()))
  WITH CHECK (doctor_id IN (SELECT current_doctor_ids()));

DROP POLICY IF EXISTS "Hospital staff manage own test orders" ON test_orders;
CREATE POLICY "Hospital staff manage own test orders" ON test_orders
  FOR ALL
  USING (
    hospital_id IN (
      SELECT ha.hospital_id FROM hospital_admins ha JOIN users u ON u.id = ha.user_id
       WHERE u.auth_id = auth.uid() AND ha.is_active AND ha.role <> 'ambulance_crew'
      UNION
      SELECT ca.hospital_id FROM clinic_admins ca JOIN users u ON u.id = ca.user_id
       WHERE u.auth_id = auth.uid() AND ca.is_active
    )
  )
  WITH CHECK (
    hospital_id IN (
      SELECT ha.hospital_id FROM hospital_admins ha JOIN users u ON u.id = ha.user_id
       WHERE u.auth_id = auth.uid() AND ha.is_active AND ha.role <> 'ambulance_crew'
      UNION
      SELECT ca.hospital_id FROM clinic_admins ca JOIN users u ON u.id = ca.user_id
       WHERE u.auth_id = auth.uid() AND ca.is_active
    )
  );

-- Verification (read-only; run after applying)
--   select count(*) from prescriptions;   -- 0
--   select count(*) from test_orders;     -- 0
--   select relname, relrowsecurity from pg_class
--    where relname in ('prescriptions','test_orders');        -- both true
