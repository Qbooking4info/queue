-- Queue — saner wait estimates
--
-- 2026-10-13 audit M9. renumber_doctor_queue() estimated
--     avg(waiting_time_secs) + (position - 1) * avg(consult_duration_secs)
-- Two problems:
--  1. Double count. waiting_time_secs is check-in -> consult start, i.e. it already
--     contains the time spent behind other patients. Adding the queue term on top
--     counted the queue twice for everyone past position 1.
--  2. Averages wrecked by consults never ended. In prod the mean consult was ~113 min
--     and the mean wait ~108 min, while the medians are 1.4 min and 3 min: a handful
--     of calls left open for hours (4 over 4h) dominated every estimate.
-- Now: medians, consults over 4 hours ignored, and the historical wait is a floor
-- (overhead before anyone is seen) rather than an addend:
--     greatest(median_wait, (position - 1) * median_consult)
-- Scoping is unchanged (consult per doctor; wait per clinic, else hospital-wide).

CREATE OR REPLACE FUNCTION renumber_doctor_queue(p_hospital_id uuid, p_doctor_id uuid, p_check_in_date date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_consult_secs numeric;  -- median consult_duration_secs, this doctor
  v_wait_secs    numeric;  -- median waiting_time_secs, this doctor's clinic (or hospital-wide)
  v_clinic_id    uuid;
BEGIN
  IF p_doctor_id IS NULL OR p_check_in_date IS NULL THEN
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_doctor_id::text || ':' || p_check_in_date::text, 0));

  SELECT clinic_id INTO v_clinic_id FROM doctors WHERE id = p_doctor_id;

  SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY consult_duration_secs) INTO v_consult_secs
  FROM appointments
  WHERE doctor_id = p_doctor_id AND consult_duration_secs IS NOT NULL
    AND consult_duration_secs <= 4 * 3600;

  SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY waiting_time_secs) INTO v_wait_secs
  FROM appointments
  WHERE hospital_id = p_hospital_id AND waiting_time_secs IS NOT NULL
    AND (v_clinic_id IS NULL OR clinic_id = v_clinic_id);

  WITH ranked AS (
    SELECT a.id,
      row_number() OVER (
        ORDER BY (a.urgency = 'emergency') DESC,
                 COALESCE(a.queue_rank_override, extract(epoch from a.checked_in_at)) ASC NULLS LAST,
                 a.created_at ASC, a.id
      ) AS rn
    FROM appointments a
    WHERE a.hospital_id = p_hospital_id
      AND a.check_in_date = p_check_in_date
      AND a.status IN ('checked_in', 'in_progress')
      AND (a.doctor_id = p_doctor_id OR a.assigned_doctor_id = p_doctor_id)
  ), est AS (
    SELECT id, rn,
      CASE WHEN v_consult_secs IS NULL AND v_wait_secs IS NULL THEN NULL
           ELSE round(greatest(COALESCE(v_wait_secs, 0), (rn - 1) * COALESCE(v_consult_secs, 0)) / 60)
      END AS wait_min
    FROM ranked
  )
  UPDATE appointments a
  SET queue_position = est.rn,
      estimated_wait = est.wait_min
  FROM est
  WHERE a.id = est.id
    AND (a.queue_position IS DISTINCT FROM est.rn OR a.estimated_wait IS DISTINCT FROM est.wait_min);
END;
$$;
