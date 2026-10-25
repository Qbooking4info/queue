-- Care plans become something that reminds the patient, not a list they have to
-- remember to open.
--
-- Two halves, deliberately split by who decides what:
--   the doctor says WHAT and HOW OFTEN  -- care_plan_tasks.times_per_day
--   the patient says WHEN              -- care_plan_task_times
--
-- A doctor prescribing "three times a day" has no idea when this person eats,
-- works or sleeps, and a reminder at the wrong hour is one that gets dismissed
-- until it is ignored entirely.

-- How many times a day the task should happen. Only meaningful for a daily
-- cadence; a weekly or one-off task happens once when it happens.
ALTER TABLE care_plan_tasks
  ADD COLUMN IF NOT EXISTS times_per_day smallint NOT NULL DEFAULT 1
    CHECK (times_per_day BETWEEN 1 AND 12);

COMMENT ON COLUMN care_plan_tasks.times_per_day IS
  'How many times a day, set by the prescribing doctor. The patient chooses the '
  'clock times in care_plan_task_times.';

-- The patient's chosen times for one task. One row per daily occurrence, so
-- "three times a day" is three rows.
CREATE TABLE IF NOT EXISTS care_plan_task_times (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     uuid NOT NULL REFERENCES care_plan_tasks(id) ON DELETE CASCADE,
  -- 0-based position within the day, so a log can name which occurrence it is
  -- without depending on the clock time, which the patient may change later.
  slot        smallint NOT NULL CHECK (slot >= 0 AND slot < 12),
  time_of_day time NOT NULL,
  -- A patient can silence one dose without losing the time they chose for it.
  enabled     boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT care_plan_task_times_one_per_slot UNIQUE (task_id, slot)
);

CREATE INDEX IF NOT EXISTS idx_care_plan_task_times_task ON care_plan_task_times (task_id);

-- Ticking: the old constraint allowed one tick per task per day, which makes a
-- three-dose task untickable past the first dose. A log now names its slot.
ALTER TABLE care_plan_task_logs
  ADD COLUMN IF NOT EXISTS slot smallint NOT NULL DEFAULT 0;

ALTER TABLE care_plan_task_logs
  DROP CONSTRAINT IF EXISTS care_plan_task_logs_task_id_done_on_key;

ALTER TABLE care_plan_task_logs
  ADD CONSTRAINT care_plan_task_logs_one_per_slot UNIQUE (task_id, done_on, slot);

COMMENT ON COLUMN care_plan_task_logs.slot IS
  'Which occurrence of the day this tick is. Existing rows default to 0, which '
  'is correct for every task that happened once a day.';

ALTER TABLE care_plan_task_times ENABLE ROW LEVEL SECURITY;

-- The times belong to the patient, so the patient manages them. Scoped through
-- the plan to that patient, the same way care_plan_task_logs already is, so
-- this cannot be used to touch somebody else's schedule.
CREATE OR REPLACE FUNCTION public.owns_care_plan_task(p_task_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM care_plan_tasks t
    JOIN care_plans p ON p.id = t.plan_id
    WHERE t.id = p_task_id
      AND p.patient_id IN (SELECT current_patient_ids())
  );
$$;

REVOKE ALL ON FUNCTION public.owns_care_plan_task(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.owns_care_plan_task(uuid) TO authenticated;

DROP POLICY IF EXISTS "patient reads own care plan times" ON care_plan_task_times;
CREATE POLICY "patient reads own care plan times" ON care_plan_task_times
  FOR SELECT USING (public.owns_care_plan_task(task_id));

DROP POLICY IF EXISTS "patient sets own care plan times" ON care_plan_task_times;
CREATE POLICY "patient sets own care plan times" ON care_plan_task_times
  FOR INSERT TO authenticated WITH CHECK (public.owns_care_plan_task(task_id));

DROP POLICY IF EXISTS "patient changes own care plan times" ON care_plan_task_times;
CREATE POLICY "patient changes own care plan times" ON care_plan_task_times
  FOR UPDATE TO authenticated
  USING (public.owns_care_plan_task(task_id))
  WITH CHECK (public.owns_care_plan_task(task_id));

DROP POLICY IF EXISTS "patient clears own care plan times" ON care_plan_task_times;
CREATE POLICY "patient clears own care plan times" ON care_plan_task_times
  FOR DELETE TO authenticated USING (public.owns_care_plan_task(task_id));
