-- Care plans (v3.1: web "Care Plans" module, patient My Care > Care plans).
--
-- A hospital creates a plan for one patient: a title, the condition it manages,
-- a date range, the next check-in, and tasks. Each task has a cadence (daily,
-- weekly or once). When the patient ticks a task, one row goes into
-- care_plan_task_logs, recording the time. Progress = logs against expected ticks.
--
-- Access:
--   patients (and caretakers, via current_patient_ids()) read their own plans
--   and tasks, and insert/delete their own task logs;
--   hospital staff read their hospital's plans and logs through RLS; writes to
--   plans and tasks go through /api/care-plans (service role, role-checked).

CREATE TABLE IF NOT EXISTS public.care_plans (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id    uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  patient_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  doctor_id      uuid REFERENCES public.doctors(id) ON DELETE SET NULL,
  created_by     uuid REFERENCES public.users(id) ON DELETE SET NULL,
  title          text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 120),
  condition      text CHECK (condition IS NULL OR length(condition) <= 120),
  notes          text CHECK (notes IS NULL OR length(notes) <= 2000),
  starts_on      date NOT NULL DEFAULT current_date,
  ends_on        date,
  next_check_in  date,
  status         text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'stopped')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT care_plan_dates CHECK (ends_on IS NULL OR ends_on >= starts_on)
);
CREATE INDEX IF NOT EXISTS care_plans_hospital_idx ON public.care_plans (hospital_id, status);
CREATE INDEX IF NOT EXISTS care_plans_patient_idx  ON public.care_plans (patient_id, status);

CREATE TABLE IF NOT EXISTS public.care_plan_tasks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id     uuid NOT NULL REFERENCES public.care_plans(id) ON DELETE CASCADE,
  title       text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 160),
  cadence     text NOT NULL DEFAULT 'daily' CHECK (cadence IN ('daily', 'weekly', 'once')),
  due_on      date,                           -- for 'once'
  sort_order  int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS care_plan_tasks_plan_idx ON public.care_plan_tasks (plan_id, sort_order);

CREATE TABLE IF NOT EXISTS public.care_plan_task_logs (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id   uuid NOT NULL REFERENCES public.care_plan_tasks(id) ON DELETE CASCADE,
  plan_id   uuid NOT NULL REFERENCES public.care_plans(id) ON DELETE CASCADE,
  done_on   date NOT NULL DEFAULT current_date,
  done_at   timestamptz NOT NULL DEFAULT now(),
  logged_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  UNIQUE (task_id, done_on)                   -- one tick per task per day
);
CREATE INDEX IF NOT EXISTS care_plan_task_logs_plan_idx ON public.care_plan_task_logs (plan_id, done_on);

ALTER TABLE public.care_plans          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.care_plan_tasks     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.care_plan_task_logs ENABLE ROW LEVEL SECURITY;

-- Plans: the patient (or their caretaker) and that hospital's staff can read.
DROP POLICY IF EXISTS "care plans readable by patient and hospital" ON public.care_plans;
CREATE POLICY "care plans readable by patient and hospital" ON public.care_plans FOR SELECT TO authenticated
  USING (patient_id IN (SELECT public.current_patient_ids())
         OR hospital_id IN (SELECT public.my_staff_hospital_ids()));

DROP POLICY IF EXISTS "care plan tasks readable with their plan" ON public.care_plan_tasks;
CREATE POLICY "care plan tasks readable with their plan" ON public.care_plan_tasks FOR SELECT TO authenticated
  USING (plan_id IN (SELECT id FROM public.care_plans));   -- care_plans' own RLS applies

DROP POLICY IF EXISTS "care plan logs readable with their plan" ON public.care_plan_task_logs;
CREATE POLICY "care plan logs readable with their plan" ON public.care_plan_task_logs FOR SELECT TO authenticated
  USING (plan_id IN (SELECT id FROM public.care_plans));

-- Ticking: only the patient side, only on an active plan, only for its own task.
DROP POLICY IF EXISTS "patient ticks own care plan task" ON public.care_plan_task_logs;
CREATE POLICY "patient ticks own care plan task" ON public.care_plan_task_logs FOR INSERT TO authenticated
  WITH CHECK (
    plan_id IN (SELECT id FROM public.care_plans WHERE status = 'active' AND patient_id IN (SELECT public.current_patient_ids())
                AND care_plan_task_logs.done_on >= starts_on AND (ends_on IS NULL OR care_plan_task_logs.done_on <= ends_on))
    AND task_id IN (SELECT id FROM public.care_plan_tasks t WHERE t.plan_id = care_plan_task_logs.plan_id)
    AND done_on BETWEEN current_date - 1 AND current_date
  );
DROP POLICY IF EXISTS "patient unticks own care plan task" ON public.care_plan_task_logs;
CREATE POLICY "patient unticks own care plan task" ON public.care_plan_task_logs FOR DELETE TO authenticated
  USING (plan_id IN (SELECT id FROM public.care_plans WHERE patient_id IN (SELECT public.current_patient_ids()))
         AND done_on >= current_date - 1);

-- Stamp who ticked, from the session, never from the client.
CREATE OR REPLACE FUNCTION public.care_plan_log_stamp() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.logged_by := (SELECT id FROM public.users WHERE auth_id = auth.uid());
  NEW.done_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS care_plan_log_stamp ON public.care_plan_task_logs;
CREATE TRIGGER care_plan_log_stamp BEFORE INSERT ON public.care_plan_task_logs
  FOR EACH ROW EXECUTE FUNCTION public.care_plan_log_stamp();

GRANT SELECT ON public.care_plans, public.care_plan_tasks TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.care_plan_task_logs TO authenticated;

-- Realtime so the hospital sees ticks arrive.
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.care_plan_task_logs;
EXCEPTION WHEN others THEN NULL; END $$;
