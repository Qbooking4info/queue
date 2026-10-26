-- "How often" becomes a count and a period the user chooses, rather than a
-- fixed menu: three times a day, twice a week, five times a month.
--
-- The shape that was here before -- cadence in (daily, weekly, once) plus a
-- times_per_day -- could only count within a day. "Twice a week" had no way to
-- be said at all, and the one weekly tick box was the proof of it.
--
-- So the count stops belonging to the day and belongs to the period:
--   cadence         -- which period: daily, weekly, monthly, or a dated one-off
--   times_per_period -- how many times within it
--
-- The two are chosen together in the apps; the patient still picks the clock
-- times, and now the weekday or day of the month as well.

-- ── the count ────────────────────────────────────────────────────────────────

ALTER TABLE care_plan_tasks DROP CONSTRAINT IF EXISTS care_plan_tasks_cadence_check;
ALTER TABLE care_plan_tasks
  ADD CONSTRAINT care_plan_tasks_cadence_check
  CHECK (cadence IN ('daily', 'weekly', 'monthly', 'once'));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'care_plan_tasks' AND column_name = 'times_per_day'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'care_plan_tasks' AND column_name = 'times_per_period'
  ) THEN
    -- Renamed rather than added beside it. Every existing row is daily or
    -- weekly, where "times per day" and "times per period" mean the same
    -- number, so the data carries over untouched. Two columns with overlapping
    -- meaning is how one of them ends up stale.
    ALTER TABLE care_plan_tasks RENAME COLUMN times_per_day TO times_per_period;
  END IF;
END $$;

ALTER TABLE care_plan_tasks
  ADD COLUMN IF NOT EXISTS times_per_period smallint NOT NULL DEFAULT 1;

ALTER TABLE care_plan_tasks DROP CONSTRAINT IF EXISTS care_plan_tasks_times_per_day_check;
ALTER TABLE care_plan_tasks DROP CONSTRAINT IF EXISTS care_plan_tasks_times_per_period_check;

-- A ceiling per period, not one flat number: 31 times a day is not a care plan,
-- and capping everything at 12 would stop a daily-but-counted-monthly goal.
ALTER TABLE care_plan_tasks
  ADD CONSTRAINT care_plan_tasks_times_per_period_check CHECK (
    times_per_period >= 1 AND times_per_period <= CASE cadence
      WHEN 'daily'   THEN 12
      WHEN 'weekly'  THEN 7
      WHEN 'monthly' THEN 31
      ELSE 1
    END
  );

COMMENT ON COLUMN care_plan_tasks.times_per_period IS
  'How many times within one cadence period: 3 with cadence=daily is three '
  'times a day, 2 with cadence=weekly is twice a week. The patient chooses the '
  'clock times -- and the weekday or day of month -- in care_plan_task_times.';

-- ── when, within the period ──────────────────────────────────────────────────

-- A weekly or monthly occurrence needs a day as well as an hour, or the
-- reminder has nothing to fire on. Null for a daily task, which happens today.
ALTER TABLE care_plan_task_times
  ADD COLUMN IF NOT EXISTS day_of_week smallint CHECK (day_of_week BETWEEN 1 AND 7);
ALTER TABLE care_plan_task_times
  ADD COLUMN IF NOT EXISTS day_of_month smallint CHECK (day_of_month BETWEEN 1 AND 28);

COMMENT ON COLUMN care_plan_task_times.day_of_week IS
  'ISO weekday, 1 = Monday. Set for a weekly task, null otherwise.';
COMMENT ON COLUMN care_plan_task_times.day_of_month IS
  'Day of the month, capped at 28 so a monthly reminder occurs in February too. '
  'Set for a monthly task, null otherwise.';

-- Up to 31 occurrences a period now, so the slot index has to reach that far.
ALTER TABLE care_plan_task_times DROP CONSTRAINT IF EXISTS care_plan_task_times_slot_check;
ALTER TABLE care_plan_task_times
  ADD CONSTRAINT care_plan_task_times_slot_check CHECK (slot >= 0 AND slot < 31);

ALTER TABLE care_plan_task_logs DROP CONSTRAINT IF EXISTS care_plan_task_logs_slot_check;
ALTER TABLE care_plan_task_logs
  ADD CONSTRAINT care_plan_task_logs_slot_check CHECK (slot >= 0 AND slot < 31);
