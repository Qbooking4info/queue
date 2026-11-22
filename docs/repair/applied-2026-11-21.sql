-- =====================================================================
-- Queue — pending database changes, 2026-11-21
--
-- Paste this whole file into the Supabase SQL editor and run it once.
-- It is wrapped in a single transaction: if any statement fails, nothing
-- is applied and you are back exactly where you started.
--
-- ORDER MATTERS. 20261121000001 reads appointments.requeued_at, which
-- 20261031000001 adds; 20261121000006 has a NOT NULL foreign key to the
-- table 20261121000005 creates.
--
-- DO NOT run `supabase db push` instead. The remote history table is
-- missing 28 migrations that were applied by hand and never recorded, so
-- push would re-run CREATE TABLE and DROP/CREATE FUNCTION statements
-- against live patient data. Section 0 below records those 28 without
-- executing them, which is what makes push safe again afterwards.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- SECTION 0 — history repair (records only, runs no DDL)
--
-- Verified 2026-11-21 against the live database: every table, function
-- and column these 28 create is already present. The one exception found
-- was care_plan_tasks.times_per_day, which is correctly absent because
-- 20261025000003 renamed it to times_per_period.
-- ---------------------------------------------------------------------

insert into supabase_migrations.schema_migrations (version, name) values ('20260825000001', 'patient_profile_read_for_appointment_staff') on conflict (version) do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260826000001', 'clinic_age_gender_restriction') on conflict (version) do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260827000001', 'dependent_account_linking') on conflict (version) do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260827000002', 'allow_dob_at_patient_signup') on conflict (version) do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260827000003', 'allow_push_token_update') on conflict (version) do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260903000001', 'doctor_multi_clinic') on conflict (version) do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260906000001', 'ambulance_provider_admins') on conflict (version) do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260910000000', 'roster_include_inactive_doctors') on conflict (version) do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260911000001', 'staff_reschedule') on conflict (version) do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260911000002', 'virtual_consultation_plan') on conflict (version) do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260913000001', 'doctor_assignment_gates') on conflict (version) do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260922000001', 'fix_patient_appointment_update_rls') on conflict (version) do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260923000001', 'emergency_booking_submit_guard') on conflict (version) do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20260928000001', 'crew_lifetime_stats') on conflict (version) do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20261003000001', 'ndpr_mechanics') on conflict (version) do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20261003000002', 'retention_purge') on conflict (version) do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20261011000001', 'signup_verification') on conflict (version) do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20261020000001', 'hospital_logo_uploads') on conflict (version) do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20261021000001', 'care_plans_doctor_authored') on conflict (version) do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20261021000002', 'locum_jobs') on conflict (version) do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20261022000001', 'locum_job_expiry') on conflict (version) do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20261023000001', 'ambulance_vehicle_photos') on conflict (version) do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20261025000001', 'care_plan_reminders') on conflict (version) do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20261025000002', 'self_authored_care_plans') on conflict (version) do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20261025000003', 'care_plan_frequency') on conflict (version) do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20261025000004', 'care_plan_task_duration') on conflict (version) do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20261027000001', 'appointment_flow_repairs') on conflict (version) do nothing;
insert into supabase_migrations.schema_migrations (version, name) values ('20261028000001', 'cross_app_process_repairs') on conflict (version) do nothing;


-- =====================================================================
-- SECTION 1 — 20261031000001_queue_fairness_and_wait_estimate.sql
-- =====================================================================

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

insert into supabase_migrations.schema_migrations (version, name) values ('20261031000001', 'queue_fairness_and_wait_estimate') on conflict (version) do nothing;


-- =====================================================================
-- SECTION 2 — 20261121000001_doctor_queue_wait_and_age.sql
-- =====================================================================

-- The doctor's queue could not say how long anyone had been waiting.
--
-- get_doctor_queue is the only way the doctors app may read a hospital queue
-- (RLS on appointments returns nothing useful to a doctor reading the table
-- directly), and its RETURNS TABLE never carried checked_in_at -- so the one
-- screen whose whole job is deciding who to call next showed appointment
-- times and no arrival times. The front desk's own queue has always had this,
-- because it reads appointments directly.
--
-- Three columns added, all read-only additions to the shape:
--
--   checked_in_at  when they physically arrived. "Waited 41 min" comes from
--                  this, not from start_time, which is when they were booked.
--   requeued_at    set by return_to_queue() when a patient comes back from a
--                  lab test. While set it replaces checked_in_at as the FIFO
--                  key (20261031000001), so the wait the doctor is shown has
--                  to use the same value or the row will claim a longer wait
--                  than its position implies.
--   patient_dob    the queue row says "F. Balogun, 34" in the v4 design. Age
--                  is clinically load-bearing at a glance and the doctor is
--                  already authorised for this patient's chart.
--
-- DEPENDS ON 20261031000001, which adds appointments.requeued_at. Apply that
-- first (scripts/apply-pending-migrations.mjs runs them in order).
--
-- CREATE OR REPLACE cannot add columns to an existing RETURNS TABLE (42P13),
-- so the function is dropped and recreated -- the same dance every previous
-- change to it has done. Body is otherwise the live definition verbatim.

DROP FUNCTION IF EXISTS get_doctor_queue(uuid, date, date);

CREATE OR REPLACE FUNCTION get_doctor_queue(
  p_doctor_id   uuid,
  p_date        date,
  p_today       date
)
RETURNS TABLE (
  id               uuid,
  appointment_date date,
  start_time       text,
  type             text,
  status           text,
  reason           text,
  urgency          text,
  queue_position   integer,
  patient_id       uuid,
  patient_name     text,
  patient_phone    text,
  patient_gender   text,
  patient_dob      date,
  checked_in_at    timestamptz,
  requeued_at      timestamptz,
  referral_reason           text,
  referred_by_doctor_name   text,
  referring_hospital_name   text,
  referring_clinic_name     text,
  hospital_id      uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;

  SELECT u.id INTO v_user_id FROM users u WHERE u.auth_id = auth.uid();

  IF NOT EXISTS (
    SELECT 1 FROM doctors d
    WHERE d.id = p_doctor_id
      AND (
        d.auth_user_id = auth.uid()
        OR d.user_id = v_user_id
        OR d.hospital_id IN (
          SELECT ha.hospital_id FROM hospital_admins ha
          WHERE ha.user_id = v_user_id AND ha.is_active = true
          UNION
          SELECT ca.hospital_id FROM clinic_admins ca
          WHERE ca.user_id = v_user_id AND ca.is_active = true
        )
      )
  ) THEN
    RAISE EXCEPTION 'Not authorised to view this doctor queue'
      USING ERRCODE = '42501';
  END IF;

  IF p_date IS NOT NULL THEN
    RETURN QUERY
      SELECT * FROM (
        SELECT DISTINCT ON (a.id)
          a.id,
          a.appointment_date,
          a.start_time::text,
          a.type,
          a.status,
          a.reason,
          a.urgency,
          a.queue_position,
          a.patient_id,
          COALESCE(u.full_name, a.walkin_patient_name) AS patient_name,
          COALESCE(u.phone, a.walkin_patient_phone)     AS patient_phone,
          u.gender        AS patient_gender,
          u.date_of_birth AS patient_dob,
          a.checked_in_at,
          a.requeued_at,
          a.referral_reason,
          CASE WHEN rd.id IS NOT NULL THEN trim(concat(rd.title, ' ', rd.full_name)) END AS referred_by_doctor_name,
          rh.name AS referring_hospital_name,
          rc.name AS referring_clinic_name,
          a.hospital_id
        FROM appointments a
        LEFT JOIN users u ON u.id = a.patient_id
        LEFT JOIN doctors rd ON rd.id = a.referred_by_doctor_id
        LEFT JOIN hospitals rh ON rh.id = a.referring_hospital_id
        LEFT JOIN hospital_clinics rc ON rc.id = a.referring_clinic_id
        WHERE (a.doctor_id = p_doctor_id OR a.assigned_doctor_id = p_doctor_id)
          AND (a.appointment_date = p_date OR a.check_in_date = p_date)
          AND a.status        <> 'cancelled'
        ORDER BY a.id
      ) sub
      ORDER BY sub.start_time;
  ELSE
    RETURN QUERY
      SELECT * FROM (
        SELECT DISTINCT ON (a.id)
          a.id,
          a.appointment_date,
          a.start_time::text,
          a.type,
          a.status,
          a.reason,
          a.urgency,
          a.queue_position,
          a.patient_id,
          COALESCE(u.full_name, a.walkin_patient_name) AS patient_name,
          COALESCE(u.phone, a.walkin_patient_phone)     AS patient_phone,
          u.gender        AS patient_gender,
          u.date_of_birth AS patient_dob,
          a.checked_in_at,
          a.requeued_at,
          a.referral_reason,
          CASE WHEN rd.id IS NOT NULL THEN trim(concat(rd.title, ' ', rd.full_name)) END AS referred_by_doctor_name,
          rh.name AS referring_hospital_name,
          rc.name AS referring_clinic_name,
          a.hospital_id
        FROM appointments a
        LEFT JOIN users u ON u.id = a.patient_id
        LEFT JOIN doctors rd ON rd.id = a.referred_by_doctor_id
        LEFT JOIN hospitals rh ON rh.id = a.referring_hospital_id
        LEFT JOIN hospital_clinics rc ON rc.id = a.referring_clinic_id
        WHERE (a.doctor_id = p_doctor_id OR a.assigned_doctor_id = p_doctor_id)
          AND a.appointment_date > p_today
          AND a.status          <> 'cancelled'
        ORDER BY a.id
      ) sub
      ORDER BY sub.appointment_date, sub.start_time;
  END IF;
END;
$$;

-- Same grants the dropped function had: the doctors app and the hospital
-- dashboard both call this as the signed-in user.
REVOKE ALL ON FUNCTION get_doctor_queue(uuid, date, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION get_doctor_queue(uuid, date, date) TO authenticated;

insert into supabase_migrations.schema_migrations (version, name) values ('20261121000001', 'doctor_queue_wait_and_age') on conflict (version) do nothing;


-- =====================================================================
-- SECTION 3 — 20261121000002_crew_run_history.sql
-- =====================================================================

-- A crew could not see a run once it ended.
--
-- RLS on transport_requests gives crew exactly one policy -- "Crew can read
-- active assigned job" (20261013100001) -- and it stops applying the moment
-- the job stops being active. So the ambulance app had no way to draw the
-- "Today" list the v4 design asks for, and worse: when dispatch cancelled a
-- run, the row simply stopped being readable and the screen snapped back to
-- "no offers" with nothing said. The crew were told more by the app going
-- quiet than by anything it displayed.
--
-- Widening the RLS policy is the wrong instrument. It would hand every crew
-- member read access to the full history of every unit they have ever been
-- rostered on, including patient names and clinical summaries, for ever. This
-- function answers the narrower question the screen actually asks: which runs
-- did I work, recently, and how did each one end.
--
-- Attribution is per person via transport_events.actor_id, exactly as
-- get_my_crew_stats already does it -- several crew share one rig, and "my
-- runs" means the ones this person was on, not the ones this vehicle did.

CREATE OR REPLACE FUNCTION get_my_crew_runs(p_limit integer DEFAULT 20)
RETURNS TABLE (
  request_id        uuid,
  booking_ref       text,
  status            text,
  triage_level      smallint,
  symptom_description text,
  pickup_address    text,
  destination_name  text,
  disposition       text,
  cancellation_reason text,
  created_at        timestamptz,
  matched_at        timestamptz,
  ended_at          timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH my_user AS (
    SELECT id FROM users WHERE auth_id = auth.uid()
  ),
  -- Every request this person recorded any event on. One row per request:
  -- a crew member who marked en_route, on_scene and arrived worked one run.
  mine AS (
    SELECT DISTINCT e.request_id
      FROM transport_events e
     WHERE e.actor_id = (SELECT id FROM my_user)
  )
  SELECT
    r.id,
    r.booking_ref,
    r.status,
    r.triage_level,
    r.symptom_description,
    r.pickup_address,
    h.name,
    r.disposition,
    r.cancellation_reason,
    r.created_at,
    r.matched_at,
    -- A cancelled run has no completed_at. The last thing that happened to it
    -- is the honest timestamp, so the crew sees when it ended rather than a
    -- blank where a time should be.
    COALESCE(r.completed_at, r.updated_at)
  FROM transport_requests r
  JOIN mine m ON m.request_id = r.id
  LEFT JOIN hospitals h ON h.id = r.destination_hospital_id
  WHERE r.status IN ('completed', 'cancelled_by_requester', 'cancelled_by_provider', 'no_unit_available')
    AND auth.uid() IS NOT NULL
  ORDER BY COALESCE(r.completed_at, r.updated_at) DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
$$;

COMMENT ON FUNCTION get_my_crew_runs(integer) IS
  'Finished and cancelled runs this crew member personally worked, newest first. Attribution is via transport_events.actor_id, not the assigned unit, because several crew share one rig. Deliberately narrower than a read policy on transport_requests, which would expose every run of every unit they have ever been rostered on.';

-- The crew app calls this as the signed-in user. anon has no crew identity to
-- resolve, so it gets nothing from the function and no grant either.
REVOKE ALL ON FUNCTION get_my_crew_runs(integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION get_my_crew_runs(integer) TO authenticated;

insert into supabase_migrations.schema_migrations (version, name) values ('20261121000002', 'crew_run_history') on conflict (version) do nothing;


-- =====================================================================
-- SECTION 4 — 20261121000003_appointment_arrival_window.sql
-- =====================================================================

-- Appointments had a start and no end, so no screen could say "arrive between
-- 09:00 and 09:30".
--
-- The window was never missing from the system -- time_slots has carried
-- start_time and end_time since the beginning. It just never reached the
-- appointment, so every screen printed a single instant and the patient read
-- it as an appointment time rather than the opening of a window. That is the
-- difference between a waiting room that fills evenly and one where everyone
-- arrives at 09:00.
--
-- Denormalised onto the appointment rather than joined at read time, the same
-- way reason, urgency and the referring hospital's name already are: the slot
-- can be edited or deleted afterwards, and what the patient was told should
-- not change retroactively when a clinic rebuilds next week's grid.

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS end_time time;

COMMENT ON COLUMN appointments.end_time IS
  'The close of the arrival window this booking was given, copied from its time_slot at booking. NULL for a walk-in or any booking with no slot, which has no window to state -- screens fall back to showing start_time alone rather than inventing one.';

-- Fill it from the slot on the way in, for every booking path at once. The
-- alternative -- setting it in each of /api/appointments, /appointments/refer,
-- createDirectAppointment and the dashboard's own insert -- is four places to
-- forget, and the one that forgets is the one a patient reads.
CREATE OR REPLACE FUNCTION set_appointment_end_time()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.end_time IS NULL AND NEW.slot_id IS NOT NULL THEN
    SELECT ts.end_time INTO NEW.end_time
      FROM time_slots ts
     WHERE ts.id = NEW.slot_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_appointment_end_time ON appointments;
CREATE TRIGGER set_appointment_end_time
  BEFORE INSERT OR UPDATE OF slot_id ON appointments
  FOR EACH ROW EXECUTE FUNCTION set_appointment_end_time();

-- Existing bookings that still have their slot get their window back. Ones
-- whose slot is gone keep NULL: there is no honest value to write, and a
-- guessed half-hour would be indistinguishable from a real one.
UPDATE appointments a
   SET end_time = ts.end_time
  FROM time_slots ts
 WHERE a.slot_id = ts.id
   AND a.end_time IS NULL
   AND ts.end_time IS NOT NULL;

-- Verification (read-only; run after applying)
--   select count(*) filter (where end_time is not null) as with_window,
--          count(*) filter (where end_time is null and slot_id is not null) as slot_but_no_window,
--          count(*) as total
--     from appointments;
--   -- slot_but_no_window should be 0.

insert into supabase_migrations.schema_migrations (version, name) values ('20261121000003', 'appointment_arrival_window') on conflict (version) do nothing;


-- =====================================================================
-- SECTION 5 — 20261121000004_hospital_beds.sql
-- =====================================================================

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

insert into supabase_migrations.schema_migrations (version, name) values ('20261121000004', 'hospital_beds') on conflict (version) do nothing;


-- =====================================================================
-- SECTION 6 — 20261121000005_prescriptions_and_test_orders.sql
-- =====================================================================

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

insert into supabase_migrations.schema_migrations (version, name) values ('20261121000005', 'prescriptions_and_test_orders') on conflict (version) do nothing;


-- =====================================================================
-- SECTION 7 — 20261121000006_lab_results.sql
-- =====================================================================

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

insert into supabase_migrations.schema_migrations (version, name) values ('20261121000006', 'lab_results') on conflict (version) do nothing;


-- =====================================================================
-- SECTION 8 — 20261121000007_user_devices.sql
-- =====================================================================

-- "Where am I signed in?" had no answer.
--
-- The patient app's privacy screen was designed with a list of signed-in
-- devices and a way to end the other ones. Supabase keeps its sessions in the
-- auth schema, which clients cannot read, so the screen had nothing to list
-- and the feature was left out.
--
-- This records the devices themselves, which is the half Queue can honestly
-- own. Note what it deliberately does NOT claim: a row here is not a session,
-- and deleting one does not sign that phone out. Ending other sessions is
-- supabase.auth.signOut({ scope: 'others' }), which is all-or-nothing by
-- design -- so the app offers exactly that, rather than a per-row "revoke"
-- button that would quietly do nothing.

CREATE TABLE IF NOT EXISTS user_devices (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Stable per-install identifier generated on the device, not a hardware id:
  -- Queue has no need to know which physical handset this is, only that it is
  -- the same install as last week.
  install_id    text NOT NULL,
  label         text,
  platform      text CHECK (platform IS NULL OR platform IN ('ios', 'android', 'web')),
  app           text CHECK (app IS NULL OR app IN ('patient', 'doctor', 'hospital', 'ambulance')),
  app_version   text,
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, install_id)
);

COMMENT ON TABLE user_devices IS
  'Devices a user has opened Queue on. NOT a session table: a row here does not grant access and removing one does not sign anything out. It exists so the privacy screen can say where the account has been used, and when.';
COMMENT ON COLUMN user_devices.install_id IS
  'Random id generated once per install and kept in local storage. Not a hardware identifier -- deliberately, so this cannot be used to recognise a person across accounts.';

CREATE INDEX IF NOT EXISTS user_devices_user_idx ON user_devices (user_id, last_seen_at DESC);

ALTER TABLE user_devices ENABLE ROW LEVEL SECURITY;

-- Strictly your own. No staff or support read path: this is a privacy
-- feature, and a support console that can see where a patient has been signed
-- in is the opposite of one.
DROP POLICY IF EXISTS "Users manage own devices" ON user_devices;
CREATE POLICY "Users manage own devices" ON user_devices
  FOR ALL
  USING (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()))
  WITH CHECK (user_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

-- Verification (read-only; run after applying)
--   select count(*) from user_devices;   -- 0
--   select relrowsecurity from pg_class where relname = 'user_devices';  -- true

insert into supabase_migrations.schema_migrations (version, name) values ('20261121000007', 'user_devices') on conflict (version) do nothing;


-- =====================================================================
-- SECTION 9 — 20261121000008_appointment_fee_at_booking.sql
-- =====================================================================

-- What a booking costs was never written down on the booking.
--
-- A direct booking quotes the doctor's virtual_fee or home_visit_fee at the
-- moment the patient books. Those live on the doctor and the doctor can change
-- them whenever they like, so a screen showing "the fee" against last week's
-- appointment was showing today's price -- for an appointment that was agreed
-- at a different one. The doctor's own schedule screen therefore showed no fee
-- at all rather than a number that might be wrong.
--
-- One column, written at booking, never updated afterwards. The same reason
-- refund_pct and payment_method are already stamped on the row: what was
-- agreed is a property of the agreement, not of the doctor's current price
-- list.

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS consultation_fee numeric(12,2)
    CHECK (consultation_fee IS NULL OR consultation_fee >= 0);

COMMENT ON COLUMN appointments.consultation_fee IS
  'What this booking was quoted at, in naira, stamped at creation and never revised. NULL where no fee was quoted (a hospital OPD visit priced by the hospital, or a walk-in). Do not read the doctor''s current fee in its place -- that is the bug this column exists to fix.';

-- Backfill is deliberately NOT attempted. The doctor's fee today is not
-- evidence of what any past booking was quoted at, and writing it in would
-- manufacture a price history that never happened. Existing rows keep NULL and
-- the screens say nothing about their fee, which is the truth.

-- Verification (read-only; run after applying)
--   select count(*) filter (where consultation_fee is not null) from appointments;  -- 0
--   -- then make a direct booking and check the new row carries its fee.

insert into supabase_migrations.schema_migrations (version, name) values ('20261121000008', 'appointment_fee_at_booking') on conflict (version) do nothing;


-- =====================================================================
-- SECTION 10 — 20261121000009_self_check_in.sql
-- =====================================================================

-- Patients could not check themselves in.
--
-- check_in is a staff action (requireRole on PATCH /api/appointments/[id]),
-- so the only way into the queue is a member of staff tapping a button. That
-- is correct for most hospitals -- the desk is also where identity is checked
-- and payment is taken -- and wrong for the ones that would rather a patient
-- arriving for an 09:00 slot joined the queue from the car park than stood in
-- a second queue to join the first one.
--
-- So it is a choice, and the default is no. A hospital that does nothing sees
-- no change whatsoever; one that turns it on gets self check-in subject to the
-- guards in /api/appointments/[id]/self-check-in: the booking must be the
-- caller's own, it must be for today, and the phone must actually be at the
-- hospital.

ALTER TABLE hospitals
  ADD COLUMN IF NOT EXISTS allow_self_check_in boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN hospitals.allow_self_check_in IS
  'Whether patients may join this hospital''s queue from their own phone on arrival. Default false: self check-in bypasses the desk, which is also where identity and payment are handled, so it is a decision each hospital makes rather than a platform default.';

-- How close "at the hospital" has to mean, in metres. A campus is bigger than
-- a doorway and a phone fix is not perfect, so this is deliberately generous;
-- it is in app_config so a hospital with an unusual site can be given a
-- different number without a deploy.
INSERT INTO app_config (key, value)
VALUES ('self_check_in_radius_m', '500')
ON CONFLICT (key) DO NOTHING;

-- Verification (read-only; run after applying)
--   select count(*) filter (where allow_self_check_in) as opted_in, count(*) from hospitals;
--   -- opted_in should be 0 immediately after applying.
--   select value from app_config where key = 'self_check_in_radius_m';   -- 500

insert into supabase_migrations.schema_migrations (version, name) values ('20261121000009', 'self_check_in') on conflict (version) do nothing;


COMMIT;

-- =====================================================================
-- After committing, run the verification block at the foot of each
-- migration file. The three that matter most:
--
--   select count(*) from information_schema.columns
--    where table_name='appointments'
--      and column_name in ('requeued_at','left_queue_at','end_time','consultation_fee');   -- 4
--
--   select has_function_privilege('authenticated','return_to_queue(uuid)','execute');      -- false
--   select has_function_privilege('authenticated','get_my_crew_runs(integer)','execute');  -- true
--
--   select count(*) from supabase_migrations.schema_migrations;   -- no longer 29 short
-- =====================================================================
