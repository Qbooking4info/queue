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
