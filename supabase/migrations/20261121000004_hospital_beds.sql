-- Bed space was one word per hospital.
--
-- hospitals.bed_space_status holds 'enough' | 'limited' | 'very_limited' |
-- 'none' | 'unknown', set by hand by whoever last remembered to, and read by
-- patients choosing a hospital, by ambulance crews choosing where to take
-- someone, and by dispatch ranking destinations. One word, typed from memory,
-- deciding where a critical patient is driven.
--
-- This adds the beds themselves. The one word stays exactly where it is and
-- keeps its meaning for every existing reader -- but where a hospital has
-- entered its beds, that word is now derived from them by trigger instead of
-- being typed. A hospital that has not entered beds is unaffected and keeps
-- setting it by hand, so nothing has to migrate before anything works.

CREATE TABLE IF NOT EXISTS hospital_beds (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id   uuid NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  -- Which ward or department this bed belongs to. Nullable: plenty of
  -- hospitals run a single undivided ward and should not be made to invent a
  -- clinic to describe it.
  clinic_id     uuid REFERENCES hospital_clinics(id) ON DELETE SET NULL,
  ward          text,
  label         text NOT NULL,
  bed_type      text NOT NULL DEFAULT 'general'
                  CHECK (bed_type IN ('general', 'icu', 'maternity', 'paediatric', 'isolation', 'emergency')),
  status        text NOT NULL DEFAULT 'free'
                  CHECK (status IN ('free', 'occupied', 'cleaning', 'out_of_service')),
  -- Who is in it, when that is known. A bed can be occupied by someone with no
  -- appointment row (a direct admission), so this is a convenience, never the
  -- source of truth for occupancy -- status is.
  occupied_by_appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  status_note   text,
  status_changed_at timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hospital_id, label)
);

COMMENT ON TABLE hospital_beds IS
  'One row per physical bed. Where a hospital has entered its beds, hospitals.bed_space_status is derived from them by trigger rather than typed by hand.';
COMMENT ON COLUMN hospital_beds.status IS
  'free | occupied | cleaning | out_of_service. "cleaning" is deliberately separate from "free": a bed between patients is not one an ambulance can be sent to, and collapsing the two is how a crew arrives to find nowhere to put the patient.';
COMMENT ON COLUMN hospital_beds.status_changed_at IS
  'When the status last moved. Drives the staleness warning on the hospital app bed board -- a bed that has been "cleaning" for three hours is a bed somebody forgot.';

CREATE INDEX IF NOT EXISTS hospital_beds_hospital_status_idx ON hospital_beds (hospital_id, status);
CREATE INDEX IF NOT EXISTS hospital_beds_clinic_idx ON hospital_beds (clinic_id) WHERE clinic_id IS NOT NULL;

-- Stamp status_changed_at only when the status actually moves, so editing a
-- bed's label does not make every bed look freshly attended to.
CREATE OR REPLACE FUNCTION touch_hospital_bed()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_changed_at := now();
    -- A bed that is no longer occupied is not still holding someone.
    IF NEW.status <> 'occupied' THEN
      NEW.occupied_by_appointment_id := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_hospital_bed ON hospital_beds;
CREATE TRIGGER touch_hospital_bed
  BEFORE INSERT OR UPDATE ON hospital_beds
  FOR EACH ROW EXECUTE FUNCTION touch_hospital_bed();

-- ---------------------------------------------------------------------------
-- The one word, derived
-- ---------------------------------------------------------------------------
--
-- Thresholds are proportions of usable beds (out_of_service excluded -- a ward
-- with half its beds broken is not "half full", it is a smaller ward). They
-- are a judgement call, not a clinical standard, which is exactly why they
-- live in one function a hospital can be shown rather than scattered through
-- four screens.
CREATE OR REPLACE FUNCTION refresh_hospital_bed_space(p_hospital_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_usable int;
  v_free   int;
  v_status text;
BEGIN
  SELECT count(*) FILTER (WHERE status <> 'out_of_service'),
         count(*) FILTER (WHERE status = 'free')
    INTO v_usable, v_free
    FROM hospital_beds
   WHERE hospital_id = p_hospital_id;

  -- No beds entered: leave whatever the hospital set by hand. This is what
  -- lets the table be adopted one hospital at a time.
  IF v_usable = 0 THEN
    RETURN;
  END IF;

  v_status := CASE
    WHEN v_free = 0 THEN 'none'
    WHEN v_free::numeric / v_usable <= 0.10 THEN 'very_limited'
    WHEN v_free::numeric / v_usable <= 0.30 THEN 'limited'
    ELSE 'enough'
  END;

  UPDATE hospitals
     SET bed_space_status = v_status,
         bed_space_updated_at = now()
   WHERE id = p_hospital_id
     AND bed_space_status IS DISTINCT FROM v_status;
END;
$$;

CREATE OR REPLACE FUNCTION hospital_beds_refresh_space()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM refresh_hospital_bed_space(COALESCE(NEW.hospital_id, OLD.hospital_id));
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS hospital_beds_refresh_space ON hospital_beds;
CREATE TRIGGER hospital_beds_refresh_space
  AFTER INSERT OR UPDATE OF status OR DELETE ON hospital_beds
  FOR EACH ROW EXECUTE FUNCTION hospital_beds_refresh_space();

-- ---------------------------------------------------------------------------
-- Who may read and write beds
-- ---------------------------------------------------------------------------

ALTER TABLE hospital_beds ENABLE ROW LEVEL SECURITY;

-- Staff of the hospital, the same shape as every other hospital-scoped table.
-- Crews and patients are deliberately NOT given row access: what they need is
-- the single derived word on hospitals, which they already read, not a list of
-- which bed is free in which ward.
DROP POLICY IF EXISTS "Hospital staff manage own beds" ON hospital_beds;
CREATE POLICY "Hospital staff manage own beds" ON hospital_beds
  FOR ALL
  USING (
    hospital_id IN (
      SELECT ha.hospital_id
        FROM hospital_admins ha JOIN users u ON u.id = ha.user_id
       WHERE u.auth_id = auth.uid() AND ha.is_active AND ha.role <> 'ambulance_crew'
      UNION
      SELECT ca.hospital_id
        FROM clinic_admins ca JOIN users u ON u.id = ca.user_id
       WHERE u.auth_id = auth.uid() AND ca.is_active
    )
  )
  WITH CHECK (
    hospital_id IN (
      SELECT ha.hospital_id
        FROM hospital_admins ha JOIN users u ON u.id = ha.user_id
       WHERE u.auth_id = auth.uid() AND ha.is_active AND ha.role <> 'ambulance_crew'
      UNION
      SELECT ca.hospital_id
        FROM clinic_admins ca JOIN users u ON u.id = ca.user_id
       WHERE u.auth_id = auth.uid() AND ca.is_active
    )
  );

REVOKE ALL ON FUNCTION refresh_hospital_bed_space(uuid) FROM public, anon, authenticated;

-- Verification (read-only; run after applying)
--   select count(*) from hospital_beds;                       -- 0 on a fresh apply
--   select bed_space_status, bed_space_updated_at from hospitals limit 5;  -- unchanged
--   -- after inserting beds for one hospital, its bed_space_status should follow them.
