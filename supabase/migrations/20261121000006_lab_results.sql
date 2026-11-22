-- Results had nowhere to live.
--
-- The v4 patient app was designed around a lab hub -- your results, when they
-- came back, whether anything is out of range. Queue had no results model at
-- all, so that screen was rebuilt on diagnoses instead and the hub became a
-- list of what doctors had written. This is the missing half.
--
-- A result belongs to an order. That is the whole point: a value with no
-- order behind it is a number nobody asked for, with no record of who wanted
-- it or why, and a patient reading "HIGH" needs to be able to get back to the
-- doctor who ordered it. Orders without results are the normal waiting state;
-- results without orders are not allowed.

CREATE TABLE IF NOT EXISTS lab_results (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_order_id   uuid NOT NULL REFERENCES test_orders(id) ON DELETE CASCADE,
  -- Denormalised from the order so a patient's results are one query and the
  -- RLS predicates match the ones on test_orders exactly.
  patient_id      uuid REFERENCES users(id) ON DELETE SET NULL,
  hospital_id     uuid REFERENCES hospitals(id) ON DELETE SET NULL,

  -- One row per analyte, so "Full blood count" comes back as its constituent
  -- lines rather than one blob: a patient can be shown the one value that is
  -- out of range instead of a paragraph they have to read for it.
  analyte         text NOT NULL,
  value_text      text,
  value_numeric   numeric,
  unit            text,
  reference_range text,
  flag            text NOT NULL DEFAULT 'normal'
                    CHECK (flag IN ('normal', 'low', 'high', 'critical', 'indeterminate')),

  note            text,
  -- A scan or a PDF from an outside laboratory. Storage object path, same
  -- convention as appointment documents.
  document_url    text,

  reported_at     timestamptz NOT NULL DEFAULT now(),
  reported_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE lab_results IS
  'Results against a test_order, one row per analyte. A result cannot exist without the order that asked for it.';
COMMENT ON COLUMN lab_results.flag IS
  'normal | low | high | critical | indeterminate. The patient app colours on this rather than comparing value_numeric to reference_range itself -- parsing "3.5-5.0" client-side is how a patient gets told they are fine when they are not.';
COMMENT ON COLUMN lab_results.value_numeric IS
  'Set alongside value_text where the result is a number, so a trend can be drawn. Non-numeric results (a culture, "no growth") keep value_text alone.';

CREATE INDEX IF NOT EXISTS lab_results_order_idx ON lab_results (test_order_id);
CREATE INDEX IF NOT EXISTS lab_results_patient_idx ON lab_results (patient_id, reported_at DESC) WHERE patient_id IS NOT NULL;

-- Filing a result closes its order. Without this the order sits at 'ordered'
-- for ever and the patient's screen keeps saying the laboratory is still
-- working while the result is on the screen underneath it.
CREATE OR REPLACE FUNCTION lab_result_closes_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE test_orders
     SET status = 'resulted', updated_at = now()
   WHERE id = NEW.test_order_id
     AND status <> 'cancelled';

  -- Inherit the order's patient and hospital rather than trusting the caller
  -- to pass them: a mismatch here is a result filed against the wrong person.
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION lab_result_inherit_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_patient uuid;
  v_hospital uuid;
BEGIN
  SELECT o.patient_id, o.hospital_id INTO v_patient, v_hospital
    FROM test_orders o WHERE o.id = NEW.test_order_id;
  NEW.patient_id  := v_patient;
  NEW.hospital_id := v_hospital;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS lab_result_inherit_scope ON lab_results;
CREATE TRIGGER lab_result_inherit_scope
  BEFORE INSERT ON lab_results
  FOR EACH ROW EXECUTE FUNCTION lab_result_inherit_scope();

DROP TRIGGER IF EXISTS lab_result_closes_order ON lab_results;
CREATE TRIGGER lab_result_closes_order
  AFTER INSERT ON lab_results
  FOR EACH ROW EXECUTE FUNCTION lab_result_closes_order();

-- ---------------------------------------------------------------------------
-- Who may read and write
-- ---------------------------------------------------------------------------

ALTER TABLE lab_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Patients read own results" ON lab_results;
CREATE POLICY "Patients read own results" ON lab_results
  FOR SELECT USING (patient_id IN (SELECT current_patient_ids()));

-- The doctor who ordered the test, through the order. Read-only: a clinician
-- does not amend a laboratory's result from a consultation screen.
DROP POLICY IF EXISTS "Ordering doctor reads results" ON lab_results;
CREATE POLICY "Ordering doctor reads results" ON lab_results
  FOR SELECT USING (
    test_order_id IN (
      SELECT o.id FROM test_orders o WHERE o.doctor_id IN (SELECT current_doctor_ids())
    )
  );

DROP POLICY IF EXISTS "Hospital staff manage own results" ON lab_results;
CREATE POLICY "Hospital staff manage own results" ON lab_results
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
    -- hospital_id is overwritten from the order by trigger, so this is checked
    -- against the order's hospital rather than whatever was submitted.
    test_order_id IN (
      SELECT o.id FROM test_orders o
       WHERE o.hospital_id IN (
         SELECT ha.hospital_id FROM hospital_admins ha JOIN users u ON u.id = ha.user_id
          WHERE u.auth_id = auth.uid() AND ha.is_active AND ha.role <> 'ambulance_crew'
         UNION
         SELECT ca.hospital_id FROM clinic_admins ca JOIN users u ON u.id = ca.user_id
          WHERE u.auth_id = auth.uid() AND ca.is_active
       )
    )
  );

REVOKE ALL ON FUNCTION lab_result_closes_order() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION lab_result_inherit_scope() FROM public, anon, authenticated;

-- Verification (read-only; run after applying)
--   select count(*) from lab_results;   -- 0
--   -- insert a test_order and a lab_result against it, then:
--   select status from test_orders where id = '<order id>';   -- 'resulted'
