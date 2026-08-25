-- Adds a baseline "check-in to consult start" term to estimated_wait, on top
-- of the existing per-position consult-duration multiplier. Previously
-- estimated_wait only accounted for (position - 1) * avg_consult_duration,
-- silently assuming the very first patient in line waits zero minutes after
-- check-in before being seen -- never true in practice (triage, room
-- turnover, the doctor finishing paperwork). The two terms are scoped
-- differently on purpose (confirmed with product): the check-in-to-start
-- overhead is a hospital/clinic operational characteristic (front desk flow,
-- room availability), so it's averaged across the doctor's own CLINIC (or the
-- whole hospital if the doctor has no clinic) rather than per-doctor; the
-- consult duration itself is inherently tied to how thorough/fast this
-- specific doctor is, so that stays per-doctor as before.

CREATE OR REPLACE FUNCTION renumber_doctor_queue(p_hospital_id uuid, p_doctor_id uuid, p_check_in_date date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_avg_secs      numeric;  -- avg consult_duration_secs, this doctor
  v_avg_wait_secs numeric;  -- avg waiting_time_secs, this doctor's clinic (or hospital-wide)
  v_clinic_id     uuid;
BEGIN
  IF p_doctor_id IS NULL OR p_check_in_date IS NULL THEN
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_doctor_id::text || ':' || p_check_in_date::text, 0));

  SELECT clinic_id INTO v_clinic_id FROM doctors WHERE id = p_doctor_id;

  SELECT avg(consult_duration_secs) INTO v_avg_secs
  FROM appointments
  WHERE doctor_id = p_doctor_id AND consult_duration_secs IS NOT NULL;

  -- Hospital-wide unless this doctor has a specific clinic, in which case
  -- scope to that clinic's own historical wait -- a fast-triage clinic and a
  -- slow one at the same hospital shouldn't share one blended number.
  SELECT avg(waiting_time_secs) INTO v_avg_wait_secs
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
  )
  UPDATE appointments a
  SET queue_position = ranked.rn,
      estimated_wait = CASE
        WHEN v_avg_secs IS NULL AND v_avg_wait_secs IS NULL THEN NULL
        ELSE round((COALESCE(v_avg_wait_secs, 0) + (ranked.rn - 1) * COALESCE(v_avg_secs, 0)) / 60)
      END
  FROM ranked
  WHERE a.id = ranked.id
    AND (a.queue_position IS DISTINCT FROM ranked.rn OR a.estimated_wait IS DISTINCT FROM
      (CASE
        WHEN v_avg_secs IS NULL AND v_avg_wait_secs IS NULL THEN NULL
        ELSE round((COALESCE(v_avg_wait_secs, 0) + (ranked.rn - 1) * COALESCE(v_avg_secs, 0)) / 60)
      END));
END;
$$;
