-- Queue — the two queue defects the 2026-10-30 product research ranked highest
-- (reports/Telehealth app features for Queue.md, defects #1, #2 and #9).
--
-- NOT YET APPLIED TO PRODUCTION. Written for review; apply only on an explicit
-- instruction, and run the verification block at the foot of this file after.
--
-- 1. A patient sent out for a lab test keeps their original checked_in_at, so
--    when they come back at 14:10 having checked in at 08:00 they are ranked
--    ahead of everyone who arrived in between. That is the single most
--    visible unfairness the queue can produce, and no published source
--    describes how any system orders returning patients -- so this takes the
--    narrow, reversible position: re-entering the queue re-stamps the ordering
--    key, with a configurable credit so the patient is not punished in full
--    for the laboratory's slowness.
--
-- 2. The consult median excludes every consultation over four hours. That
--    filter was added to stop never-ended consults (a known data defect,
--    consult_ended_at NULL) from dominating the mean. It also silently
--    discards every genuinely long consultation, which biases the estimate
--    optimistic on exactly the busy days when patients most need it to be
--    right. Excluding unfinished rows is the correct filter; excluding long
--    ones is not.
--
-- 3. One median for all of time ignores that a Monday 09:00 outpatient clinic
--    and a Thursday 15:00 one are different queues. Conditioning on weekday
--    and hour is the cheapest documented improvement over the "average wait x
--    number ahead" baseline, which the published models beat by 35-50%. The
--    conditioned median is used only when its sample is large enough to mean
--    anything; otherwise this behaves exactly as before.
--
-- The greatest(historical floor, queue term) shape is deliberately kept. It
-- biases the estimate upward, which is what a patient-facing wait model should
-- do: being seen early is a pleasant surprise, being seen late is a broken
-- promise.

-- ---------------------------------------------------------------------------
-- 1. Re-entering the queue after leaving it
-- ---------------------------------------------------------------------------

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS left_queue_at     timestamptz,
  ADD COLUMN IF NOT EXISTS left_queue_reason text,
  ADD COLUMN IF NOT EXISTS requeued_at       timestamptz,
  ADD COLUMN IF NOT EXISTS requeue_count     smallint NOT NULL DEFAULT 0;

COMMENT ON COLUMN appointments.left_queue_at IS
  'Set when the patient is sent out of the waiting room mid-visit (laboratory, imaging, pharmacy). Informational; the queue position is not suspended by this migration.';
COMMENT ON COLUMN appointments.left_queue_reason IS
  'Free text from the clinician or front desk: where the patient was sent. Shown to the front desk so a waiting room can account for who is missing.';
COMMENT ON COLUMN appointments.requeued_at IS
  'When the patient re-entered the queue after leaving it. Replaces checked_in_at as the FIFO ordering key while set, so a returner is not ranked ahead of everyone who arrived while they were away. Written only by return_to_queue().';
COMMENT ON COLUMN appointments.requeue_count IS
  'How many times this visit has re-entered the queue. A visit bouncing repeatedly between clinic and laboratory is the signal a front desk needs to escalate.';

-- How much of the wait a returning patient keeps. Zero sends them to the very
-- back, which punishes the patient for the laboratory's slowness; a very large
-- value reproduces today's bug. 30 minutes is a starting position, NOT an
-- evidence-based one -- no source found describes how returning patients
-- should be ordered. It is in app_config precisely so a hospital can be told
-- what it means and change it without a deploy.
INSERT INTO app_config (key, value)
VALUES ('lab_return_credit_minutes', '30')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION return_to_queue(p_appointment_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_credit_min numeric;
  v_hospital_id uuid;
  v_doctor_id   uuid;
  v_date        date;
BEGIN
  SELECT COALESCE(NULLIF(value, '')::numeric, 30) INTO v_credit_min
    FROM app_config WHERE key = 'lab_return_credit_minutes';
  v_credit_min := COALESCE(v_credit_min, 30);

  UPDATE appointments
     SET requeued_at   = now() - make_interval(mins => v_credit_min::int),
         requeue_count = requeue_count + 1,
         left_queue_at = NULL,
         -- A manual reorder from before the patient left is stale advice about
         -- a queue that no longer exists; clearing it lets the new key apply.
         queue_rank_override = NULL,
         updated_at = now()
   WHERE id = p_appointment_id
     AND status = 'checked_in'
  RETURNING hospital_id, COALESCE(doctor_id, assigned_doctor_id), check_in_date
    INTO v_hospital_id, v_doctor_id, v_date;

  IF v_hospital_id IS NULL THEN
    RAISE EXCEPTION 'Only a checked-in appointment can re-enter the queue';
  END IF;

  PERFORM renumber_doctor_queue(v_hospital_id, v_doctor_id, v_date);
END;
$$;

-- Trusted-caller function, same posture as move_appointment_in_queue: the API
-- route decides who may send a patient out and bring them back.
REVOKE ALL ON FUNCTION return_to_queue(uuid) FROM public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Ordering key and wait estimate
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION renumber_doctor_queue(p_hospital_id uuid, p_doctor_id uuid, p_check_in_date date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_consult_secs numeric;  -- median consult_duration_secs, this doctor, finished consults only
  v_wait_secs    numeric;  -- median waiting_time_secs, this doctor's clinic (or hospital-wide)
  v_clinic_id    uuid;
  v_dow          int;
  v_hour         int;
  v_cond_secs    numeric;
  v_cond_n       bigint;
BEGIN
  IF p_doctor_id IS NULL OR p_check_in_date IS NULL THEN
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_doctor_id::text || ':' || p_check_in_date::text, 0));

  SELECT clinic_id INTO v_clinic_id FROM doctors WHERE id = p_doctor_id;

  -- Finished consults only. A row with consult_ended_at NULL has no duration
  -- that means anything -- that is the data defect the old "<= 4 hours" filter
  -- was really reaching for, and filtering on it directly keeps the genuinely
  -- long consultations in the median where they belong.
  SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY consult_duration_secs) INTO v_consult_secs
  FROM appointments
  WHERE doctor_id = p_doctor_id
    AND consult_duration_secs IS NOT NULL
    AND consult_ended_at IS NOT NULL;

  -- Overall clinic wait, the fallback.
  SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY waiting_time_secs) INTO v_wait_secs
  FROM appointments
  WHERE hospital_id = p_hospital_id AND waiting_time_secs IS NOT NULL
    AND (v_clinic_id IS NULL OR clinic_id = v_clinic_id);

  -- The same wait, conditioned on this weekday and time of day. Clinics do not
  -- have one queue, they have a Monday-morning queue and a Thursday-afternoon
  -- queue, and the difference between them is larger than anything else this
  -- function models.
  v_dow  := extract(isodow FROM (now() AT TIME ZONE 'Africa/Lagos'));
  v_hour := extract(hour   FROM (now() AT TIME ZONE 'Africa/Lagos'));

  SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY waiting_time_secs), count(*)
    INTO v_cond_secs, v_cond_n
  FROM appointments
  WHERE hospital_id = p_hospital_id AND waiting_time_secs IS NOT NULL
    AND (v_clinic_id IS NULL OR clinic_id = v_clinic_id)
    AND extract(isodow FROM (checked_in_at AT TIME ZONE 'Africa/Lagos')) = v_dow
    AND abs(extract(hour FROM (checked_in_at AT TIME ZONE 'Africa/Lagos')) - v_hour) <= 1;

  -- 20 is a judgement call, not a derived threshold: enough that one unusual
  -- morning cannot set the estimate, few enough that a single clinic reaches it
  -- within weeks. Below it, behave exactly as before.
  IF v_cond_n >= 20 AND v_cond_secs IS NOT NULL THEN
    v_wait_secs := v_cond_secs;
  END IF;

  WITH ranked AS (
    SELECT a.id,
      row_number() OVER (
        ORDER BY (a.urgency = 'emergency') DESC,
                 -- requeued_at wins where set: a patient who left for the lab
                 -- and came back is ordered by when they came back, not by
                 -- when they first arrived this morning.
                 COALESCE(
                   a.queue_rank_override,
                   extract(epoch from COALESCE(a.requeued_at, a.checked_in_at))
                 ) ASC NULLS LAST,
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

-- requeued_at joins the watch list so a return re-ranks the queue even if some
-- future caller writes the column directly instead of going through the RPC.
DROP TRIGGER IF EXISTS renumber_queue_after_change ON appointments;
CREATE TRIGGER renumber_queue_after_change
  AFTER INSERT OR UPDATE OF status, doctor_id, assigned_doctor_id, urgency, checked_in_at,
                            queue_rank_override, requeued_at ON appointments
  FOR EACH ROW EXECUTE FUNCTION renumber_queue_after_change();


-- ---------------------------------------------------------------------------
-- 3. Keep the reorder function on the same ordering key
-- ---------------------------------------------------------------------------
--
-- Caught in review before this migration was applied. move_appointment_in_queue()
-- builds its array of neighbouring ranks with its own copy of the ordering key.
-- Section 2 above changed renumber_doctor_queue()'s key to
-- COALESCE(requeued_at, checked_in_at) but left this one on checked_in_at, so
-- for any patient back from the laboratory the two functions would disagree
-- about the order of the queue: the midpoint computed here would be taken
-- between the wrong two neighbours, and the patient would land somewhere other
-- than the position they picked. The bug is only reachable once a patient has a
-- requeued_at, which is to say only once section 1 exists -- which is why both
-- belong in the same migration.

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
  SELECT COALESCE(queue_rank_override, extract(epoch from COALESCE(requeued_at, checked_in_at))) INTO v_in_progress_rank
  FROM appointments
  WHERE hospital_id = v_hospital_id AND check_in_date = v_date AND status = 'in_progress'
    AND (doctor_id = v_doctor_id OR assigned_doctor_id = v_doctor_id)
    AND (urgency = 'emergency') = v_is_emergency
  LIMIT 1;

  SELECT array_agg(id ORDER BY rnk), array_agg(rnk ORDER BY rnk)
    INTO v_ids, v_ranks
  FROM (
    SELECT id, COALESCE(queue_rank_override, extract(epoch from COALESCE(requeued_at, checked_in_at))) AS rnk
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
-- ---------------------------------------------------------------------------
-- Verification (read-only; run after applying)
-- ---------------------------------------------------------------------------
-- 1. Columns and config exist:
--      select column_name from information_schema.columns
--       where table_name='appointments' and column_name in ('left_queue_at','requeued_at','requeue_count');
--      select value from app_config where key='lab_return_credit_minutes';
-- 2. return_to_queue is not client-callable:
--      select has_function_privilege('authenticated','return_to_queue(uuid)','execute');  -- false
--      select has_function_privilege('anon','return_to_queue(uuid)','execute');           -- false
-- 3. The ordering key changed:
--      select pg_get_functiondef('renumber_doctor_queue(uuid,uuid,date)'::regprocedure) like '%requeued_at%';
-- 4. The consult median no longer discards long finished consults:
--      select count(*) filter (where consult_duration_secs > 4*3600 and consult_ended_at is not null)
--        as newly_included from appointments;
-- 5. Both functions agree about the ordering key:
--      select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--       where n.nspname='public' and p.proname in ('renumber_doctor_queue','move_appointment_in_queue')
--         and pg_get_functiondef(p.oid) like '%requeued_at%';   -- 2
