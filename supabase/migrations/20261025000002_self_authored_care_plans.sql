-- Patients set their own goals alongside the doctor's plan: "no alcohol today",
-- "walk after dinner" -- the things nobody prescribed but they want to hold
-- themselves to. Same tasks, same ticking, same reminders.
--
-- The safety property this migration exists to guarantee: a patient can create,
-- edit and delete their OWN goals, and can never touch a plan a doctor wrote.
-- That is enforced twice -- in the policies, and again in a trigger -- because
-- a policy alone cannot stop a row being moved between the two kinds.

ALTER TABLE care_plans
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'clinical'
    CHECK (source IN ('clinical', 'self'));

COMMENT ON COLUMN care_plans.source IS
  'clinical = written by a doctor or hospital. self = the patient''s own goals. '
  'Fixed at creation: a trigger refuses to change it, so a self-authored plan '
  'can never acquire the standing of a prescribed one.';

CREATE INDEX IF NOT EXISTS idx_care_plans_patient_source
  ON care_plans (patient_id, source, status);

/** True when the plan is this patient's own goal list, not a prescribed one. */
CREATE OR REPLACE FUNCTION public.owns_self_care_plan(p_plan_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM care_plans p
    WHERE p.id = p_plan_id
      AND p.source = 'self'
      AND p.patient_id IN (SELECT current_patient_ids())
  );
$$;

REVOKE ALL ON FUNCTION public.owns_self_care_plan(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.owns_self_care_plan(uuid) TO authenticated;

-- ── the plan itself ──────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "patient creates own goals" ON care_plans;
CREATE POLICY "patient creates own goals" ON care_plans
  FOR INSERT TO authenticated
  WITH CHECK (
    source = 'self'
    AND patient_id IN (SELECT current_patient_ids())
    -- A self-authored plan belongs to nobody else. Allowing either of these to
    -- be set would file a patient's private goal under a hospital's roster, or
    -- against a doctor who never saw it.
    AND hospital_id IS NULL
    AND doctor_id IS NULL
  );

DROP POLICY IF EXISTS "patient edits own goals" ON care_plans;
CREATE POLICY "patient edits own goals" ON care_plans
  FOR UPDATE TO authenticated
  USING (source = 'self' AND patient_id IN (SELECT current_patient_ids()))
  WITH CHECK (source = 'self' AND patient_id IN (SELECT current_patient_ids()));

DROP POLICY IF EXISTS "patient deletes own goals" ON care_plans;
CREATE POLICY "patient deletes own goals" ON care_plans
  FOR DELETE TO authenticated
  USING (source = 'self' AND patient_id IN (SELECT current_patient_ids()));

-- ── its tasks ────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "patient adds own goal tasks" ON care_plan_tasks;
CREATE POLICY "patient adds own goal tasks" ON care_plan_tasks
  FOR INSERT TO authenticated WITH CHECK (public.owns_self_care_plan(plan_id));

DROP POLICY IF EXISTS "patient edits own goal tasks" ON care_plan_tasks;
CREATE POLICY "patient edits own goal tasks" ON care_plan_tasks
  FOR UPDATE TO authenticated
  USING (public.owns_self_care_plan(plan_id))
  WITH CHECK (public.owns_self_care_plan(plan_id));

DROP POLICY IF EXISTS "patient deletes own goal tasks" ON care_plan_tasks;
CREATE POLICY "patient deletes own goal tasks" ON care_plan_tasks
  FOR DELETE TO authenticated USING (public.owns_self_care_plan(plan_id));

-- ── the guard the policies cannot provide ────────────────────────────────────

/**
 * `source` is immutable once set.
 *
 * Without this, the UPDATE policy above lets a patient edit any row already
 * marked 'self', and the WITH CHECK only re-tests the new row -- so nothing
 * stops a clinical plan being flipped to 'self' by someone who can reach it,
 * after which the patient owns a plan their doctor wrote. Equally a patient
 * could promote their own goal list to 'clinical' and have it read as
 * prescribed.
 *
 * Service-role callers bypass RLS but not triggers, so this is also what stops
 * an API route reclassifying a plan by accident.
 */
CREATE OR REPLACE FUNCTION public.care_plans_source_is_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.source IS DISTINCT FROM OLD.source THEN
    RAISE EXCEPTION 'care_plans.source cannot be changed (% -> %)', OLD.source, NEW.source;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_care_plans_source_immutable ON care_plans;
CREATE TRIGGER trg_care_plans_source_immutable
  BEFORE UPDATE ON care_plans
  FOR EACH ROW EXECUTE FUNCTION public.care_plans_source_is_immutable();
