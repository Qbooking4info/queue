-- Manual queue reordering (patient self-delay + front-desk move) and the
-- "get ready" pre-alert guard.
--
-- queue_position/estimated_wait are entirely trigger-derived off checked_in_at
-- (20260805000001_atomic_queue_renumbering.sql) -- any manual position would be
-- silently wiped the next time ANYTHING in that doctor's queue changes (a new
-- check-in, a completion, etc. all re-fire renumber_doctor_queue()). Fixed by
-- giving the ORDER BY an override key that survives renumbering: queue_rank_override,
-- a nullable numeric column that participates in the same ORDER BY ahead of
-- checked_in_at, defaulting to it when unset. Moving a patient just writes a new
-- rank value (fractional/gap ranking, same technique as Trello/Jira card ordering)
-- instead of rewriting every row's position.

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS queue_rank_override numeric,
  ADD COLUMN IF NOT EXISTS next_up_alert_sent_at timestamptz;

COMMENT ON COLUMN appointments.queue_rank_override IS
  'Manual reorder key (fractional ranking). NULL = natural FIFO by checked_in_at. Set only by move_appointment_in_queue().';
COMMENT ON COLUMN appointments.next_up_alert_sent_at IS
  'One-shot guard: set the first time this appointment is alerted that it is next in line (queue_position=2 when the doctor starts the patient ahead of it). Prevents repeat pushes on every subsequent queue renumber.';

CREATE OR REPLACE FUNCTION renumber_doctor_queue(p_hospital_id uuid, p_doctor_id uuid, p_check_in_date date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_avg_secs numeric;
BEGIN
  IF p_doctor_id IS NULL OR p_check_in_date IS NULL THEN
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_doctor_id::text || ':' || p_check_in_date::text, 0));

  SELECT avg(consult_duration_secs) INTO v_avg_secs
  FROM appointments
  WHERE doctor_id = p_doctor_id AND consult_duration_secs IS NOT NULL;

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
      estimated_wait = CASE WHEN v_avg_secs IS NULL THEN NULL ELSE round((ranked.rn - 1) * v_avg_secs / 60) END
  FROM ranked
  WHERE a.id = ranked.id
    AND (a.queue_position IS DISTINCT FROM ranked.rn OR a.estimated_wait IS DISTINCT FROM
      (CASE WHEN v_avg_secs IS NULL THEN NULL ELSE round((ranked.rn - 1) * v_avg_secs / 60) END));
END;
$$;

-- queue_rank_override added to the trigger's watch list so a direct write to it
-- (there isn't one today outside move_appointment_in_queue, which calls
-- renumber_doctor_queue explicitly anyway) would still self-heal.
DROP TRIGGER IF EXISTS renumber_queue_after_change ON appointments;
CREATE TRIGGER renumber_queue_after_change
  AFTER INSERT OR UPDATE OF status, doctor_id, assigned_doctor_id, urgency, checked_in_at, queue_rank_override ON appointments
  FOR EACH ROW EXECUTE FUNCTION renumber_queue_after_change();

-- Moves a checked-in appointment to p_new_position within its own doctor+day
-- queue. p_new_position is a GLOBAL position (1 = front of the whole queue,
-- matching what get_doctor_queue/the UI display) -- translated internally to an
-- index within the appointment's own urgency tier, so a routine patient can
-- never be moved ahead of (or asked to displace) an emergency one, and never
-- ahead of whoever is currently in_progress (immovable -- they're already being
-- seen). All direction/ownership/permission checks live in the calling API
-- route, NOT here -- this function trusts its caller completely (see REVOKE
-- below), matching renumber_doctor_queue's own SECURITY DEFINER + REVOKE pattern.
CREATE OR REPLACE FUNCTION move_appointment_in_queue(p_appointment_id uuid, p_new_position integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_hospital_id uuid;
  v_doctor_id   uuid;
  v_date        date;
  v_status      text;
  v_is_emergency boolean;
  v_in_progress_rank numeric;
  v_ids  uuid[];
  v_ranks numeric[];
  v_n int;
  v_tier_offset int;
  v_target_idx int;
  v_new_rank numeric;
  RANK_STEP CONSTANT numeric := 60;
BEGIN
  SELECT hospital_id, COALESCE(doctor_id, assigned_doctor_id), check_in_date, status, (urgency = 'emergency')
    INTO v_hospital_id, v_doctor_id, v_date, v_status, v_is_emergency
  FROM appointments WHERE id = p_appointment_id
  FOR UPDATE;

  IF v_doctor_id IS NULL OR v_date IS NULL THEN
    RAISE EXCEPTION 'Appointment is not in an active queue' USING ERRCODE = '22023';
  END IF;
  IF v_status <> 'checked_in' THEN
    RAISE EXCEPTION 'Only a checked-in appointment can be repositioned' USING ERRCODE = '22023';
  END IF;
  IF p_new_position IS NULL OR p_new_position < 1 THEN
    RAISE EXCEPTION 'Invalid position' USING ERRCODE = '22023';
  END IF;

  -- Same lock key as renumber_doctor_queue -- advisory locks are re-entrant
  -- per transaction, so calling renumber_doctor_queue below (which re-acquires
  -- it) is safe and serializes against any concurrent check-in/completion/move.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_doctor_id::text || ':' || v_date::text, 0));

  -- renumber_doctor_queue's ORDER BY only ever splits the queue into TWO tiers --
  -- (urgency = 'emergency') DESC -- lumping 'routine' and 'urgent' together in the
  -- same tier. Mirror that exactly here, not a 3-way split by the literal urgency
  -- string, or a routine/urgent patient's "tier" would wrongly exclude each other.
  SELECT count(*) INTO v_tier_offset FROM appointments
  WHERE hospital_id = v_hospital_id AND check_in_date = v_date
    AND status IN ('checked_in', 'in_progress')
    AND (doctor_id = v_doctor_id OR assigned_doctor_id = v_doctor_id)
    AND NOT v_is_emergency AND urgency = 'emergency';

  -- The in_progress row in MY OWN tier (if any) is a fixed lower bound -- nothing
  -- can be moved ahead of whoever the doctor is already seeing.
  SELECT COALESCE(queue_rank_override, extract(epoch from checked_in_at)) INTO v_in_progress_rank
  FROM appointments
  WHERE hospital_id = v_hospital_id AND check_in_date = v_date AND status = 'in_progress'
    AND (doctor_id = v_doctor_id OR assigned_doctor_id = v_doctor_id)
    AND (urgency = 'emergency') = v_is_emergency
  LIMIT 1;

  SELECT array_agg(id ORDER BY rnk), array_agg(rnk ORDER BY rnk)
    INTO v_ids, v_ranks
  FROM (
    SELECT id, COALESCE(queue_rank_override, extract(epoch from checked_in_at)) AS rnk
    FROM appointments
    WHERE hospital_id = v_hospital_id AND check_in_date = v_date AND status = 'checked_in'
      AND (doctor_id = v_doctor_id OR assigned_doctor_id = v_doctor_id)
      AND (urgency = 'emergency') = v_is_emergency
      AND id <> p_appointment_id
  ) sub;
  v_n := COALESCE(array_length(v_ids, 1), 0);

  -- Translate the requested GLOBAL position into a 1-based index within my own
  -- tier (excluding myself), clamped to [1, v_n + 1] -- a request that overshoots
  -- (or undershoots into a higher tier) just lands at the nearest valid end of
  -- my own tier rather than erroring, since the queue can change between the
  -- client reading positions and submitting a move.
  v_target_idx := LEAST(GREATEST(p_new_position - v_tier_offset, 1), v_n + 1);

  IF v_n = 0 THEN
    v_new_rank := COALESCE(v_in_progress_rank, 0) + RANK_STEP;
  ELSIF v_target_idx = 1 THEN
    v_new_rank := CASE WHEN v_in_progress_rank IS NOT NULL
      THEN (v_in_progress_rank + v_ranks[1]) / 2
      ELSE v_ranks[1] - RANK_STEP END;
  ELSIF v_target_idx = v_n + 1 THEN
    v_new_rank := v_ranks[v_n] + RANK_STEP;
  ELSE
    v_new_rank := (v_ranks[v_target_idx - 1] + v_ranks[v_target_idx]) / 2;
  END IF;

  UPDATE appointments SET queue_rank_override = v_new_rank WHERE id = p_appointment_id;
  PERFORM renumber_doctor_queue(v_hospital_id, v_doctor_id, v_date);
END;
$$;

-- Must only ever be called from the service-role API route, which owns every
-- direction/ownership/permission check (patient: own appointment, later-only;
-- staff: any checked-in patient at their hospital, any direction). A direct
-- client call would bypass all of that.
REVOKE ALL ON FUNCTION move_appointment_in_queue(uuid, integer) FROM public, anon, authenticated;
