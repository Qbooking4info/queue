-- How long a task runs for, as distinct from how often it happens.
--
-- Duration lived only on the plan ("runs for 4 weeks"), which could not say
-- "antibiotics twice daily for 1 week" inside a twelve-week recovery plan, and
-- gave a patient's own goal no end at all -- every goal ran forever, and the
-- only way to stop one was to delete it along with its history.
--
-- Stored as the date it ends rather than a count of weeks: an absolute date
-- survives the task being edited, means the same thing read from any timezone,
-- and needs no arithmetic to decide whether today is inside it.

ALTER TABLE care_plan_tasks
  ADD COLUMN IF NOT EXISTS ends_on date;

COMMENT ON COLUMN care_plan_tasks.ends_on IS
  'Last day this task is asked for. Null means it runs as long as the plan '
  'does, which is what every task did before this column existed.';

-- Listing a plan's live tasks is the common read, and it filters on this.
CREATE INDEX IF NOT EXISTS idx_care_plan_tasks_plan_ends
  ON care_plan_tasks (plan_id, ends_on);

-- A task cannot finish before the plan it belongs to begins. Checked against
-- the plan, so it has to be a trigger rather than a column CHECK.
CREATE OR REPLACE FUNCTION public.care_plan_task_end_is_sane()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  plan_start date;
BEGIN
  IF NEW.ends_on IS NULL THEN RETURN NEW; END IF;
  SELECT starts_on INTO plan_start FROM care_plans WHERE id = NEW.plan_id;
  IF plan_start IS NOT NULL AND NEW.ends_on < plan_start THEN
    RAISE EXCEPTION 'care_plan_tasks.ends_on (%) is before the plan starts (%)', NEW.ends_on, plan_start;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_care_plan_task_end_is_sane ON care_plan_tasks;
CREATE TRIGGER trg_care_plan_task_end_is_sane
  BEFORE INSERT OR UPDATE OF ends_on, plan_id ON care_plan_tasks
  FOR EACH ROW EXECUTE FUNCTION public.care_plan_task_end_is_sane();
