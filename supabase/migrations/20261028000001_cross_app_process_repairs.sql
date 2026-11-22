-- Cross-app process repairs — review of 2026-10-28.
--
-- Four defects found by tracing the ambulance, hospital and doctor flows the
-- same way the appointment flow was traced. Each was confirmed against
-- production before being written.

-- ── A. The vehicle photo had nowhere to be saved ───────────────────────────
--
-- `ambulances` has RLS enabled and NO policies at all, so the app's
-- `.from('ambulances').update({ photo_url })` matched zero rows -- and PostgREST
-- reports that as success, not as an error, so the upload appeared to work every
-- time. 0 of 25 units have a photo.
--
-- Granting the table an UPDATE policy would be the wrong fix: it would also open
-- `status`, `is_active` and `vehicle_tier`, which dispatch depends on and which
-- only the duty and dispatch functions should ever move. A function that writes
-- exactly one column keeps the table closed.
--
-- Who may do it mirrors `can_manage_ambulance_media`, which already gates the
-- storage upload: provider owner/admin, or an owner/admin of the hospital that
-- runs the fleet. Whoever can put the file in the bucket can record where it is,
-- and nobody else.

CREATE OR REPLACE FUNCTION public.set_ambulance_photo(p_ambulance_id uuid, p_url text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ok boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM ambulances a
    JOIN ambulance_providers p ON p.id = a.provider_id
    WHERE a.id = p_ambulance_id
      AND (
        EXISTS (
          SELECT 1 FROM ambulance_provider_admins pa
          JOIN users u ON u.id = pa.user_id
          WHERE u.auth_id = auth.uid()
            AND pa.provider_id = p.id AND pa.is_active
            AND pa.role IN ('owner', 'admin')
        )
        OR EXISTS (
          SELECT 1 FROM hospital_admins ha
          JOIN users u2 ON u2.id = ha.user_id
          WHERE u2.auth_id = auth.uid()
            AND ha.hospital_id = p.hospital_id AND ha.is_active
            AND ha.role IN ('owner', 'admin')
        )
      )
  ) INTO v_ok;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'you are not authorised to change this unit''s photo'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Null clears the photo; anything else must look like a URL rather than
  -- arbitrary text, since this is rendered straight into an <Image>.
  IF p_url IS NOT NULL AND p_url !~ '^https?://' THEN
    RAISE EXCEPTION 'photo url must be http(s)' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE ambulances SET photo_url = p_url, updated_at = now() WHERE id = p_ambulance_id;
  RETURN p_url;
END;
$$;

REVOKE ALL ON FUNCTION public.set_ambulance_photo(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_ambulance_photo(uuid, text) TO authenticated;

-- ── B. A crew whose shift ends mid-job could not finish it ─────────────────
--
-- my_crew_unit_for_request required `now() between s.starts_at and s.ends_at`.
-- The moment the shift clock ran out -- or an admin deleted the shift -- the
-- crew could no longer resolve the request they were physically in the middle
-- of, so they could not mark arrival or completion and the transport stayed
-- active for good.
--
-- A shift says who may START work on a unit. It must not decide who may FINISH
-- a job already assigned to them: the patient is in the vehicle either way.
-- So the shift window still governs the normal case, and a second branch lets
-- the crew of the assigned unit's provider close out a transport that is
-- already in flight.

CREATE OR REPLACE FUNCTION public.my_crew_unit_for_request(p_request_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.assigned_unit_id
    FROM transport_requests r
   WHERE r.id = p_request_id
     AND (
       -- On shift now: the ordinary case.
       r.assigned_unit_id IN (
         SELECT s.ambulance_id
           FROM ambulance_shifts s
           JOIN ambulance_shift_crew sc ON sc.shift_id = s.id
          WHERE now() BETWEEN s.starts_at AND s.ends_at
            AND (
              sc.crew_member_id IN (
                SELECT c.id FROM ambulance_crew c
                 WHERE c.user_id = (SELECT id FROM users WHERE auth_id = auth.uid()) AND c.is_active
              )
              OR sc.hospital_admin_id IN (
                SELECT ha.id FROM hospital_admins ha
                 WHERE ha.user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
                   AND ha.role = 'ambulance_crew' AND ha.is_active
              )
            )
       )
       -- Or: the job is already in flight on this unit and the caller is crew
       -- for the provider that owns it. Bounded to the active states, so this
       -- grants nothing once the transport is over.
       OR (
         r.status IN ('matched', 'en_route_to_patient', 'on_scene', 'transporting', 'arrived_at_destination')
         AND EXISTS (
           SELECT 1
             FROM ambulances a
             JOIN ambulance_crew c ON c.provider_id = a.provider_id
            WHERE a.id = r.assigned_unit_id
              AND c.is_active
              AND c.user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
         )
       )
     );
$$;

-- ── C. A unit that never reported was invisible to the stale alarm ─────────
--
-- The alert joined ambulance_current_location, so a unit with no row at all
-- produced no row and therefore no alert -- the worst case, a transport whose
-- unit has never reported a position, was the one case nobody was told about.
-- 3 of 25 units have no location row.

CREATE OR REPLACE FUNCTION public.flag_stale_tracking()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count integer := 0;
BEGIN
  INSERT INTO dispatcher_alerts (request_id, severity, kind, message)
  SELECT t.id,
         CASE WHEN t.triage_level <= 2 THEN 'critical' ELSE 'high' END,
         'tracking_stale',
         CASE WHEN l.ambulance_id IS NULL
              THEN 'No position has ever been received from this unit during an active transport.'
              ELSE 'No position update in over 90 seconds during an active transport.'
         END
    FROM transport_requests t
    LEFT JOIN ambulance_current_location l ON l.ambulance_id = t.assigned_unit_id
   WHERE t.status IN ('en_route_to_patient', 'transporting')
     AND (l.ambulance_id IS NULL OR l.recorded_at < now() - interval '90 seconds')
     AND NOT EXISTS (
       SELECT 1 FROM dispatcher_alerts a
        WHERE a.request_id = t.id AND a.kind = 'tracking_stale'
          AND a.created_at > now() - interval '5 minutes'
     );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ── D. Abandoned checkouts sat 'pending' for ever ──────────────────────────
--
-- 5 payments are pending, the oldest for seven weeks, and three of them belong
-- to appointments that have since been COMPLETED -- the patient was seen. There
-- is no reconciliation anywhere, so a checkout the patient abandoned, and one
-- whose webhook was simply missed, look identical and stay that way.
--
-- This must not be settled by a timer. A payment that really succeeded but
-- whose webhook never arrived would be written off as failed, which loses money
-- silently. The only thing that knows the truth is Paystack, so the cron does
-- what the transport sweep does: calls a route that asks, and settles each
-- payment on the answer.

INSERT INTO app_config (key, value)
VALUES ('payment_reconcile_url', 'https://queue-web-omega.vercel.app/api/payments/reconcile')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.invoke_payment_reconcile()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_url    text;
  v_secret text;
BEGIN
  SELECT value INTO v_url    FROM app_config WHERE key = 'payment_reconcile_url';
  SELECT value INTO v_secret FROM app_config WHERE key = 'cron_secret';
  IF v_url IS NULL OR v_secret IS NULL THEN
    RETURN;   -- unconfigured is quiet, not an error
  END IF;

  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'Authorization', 'Bearer ' || v_secret),
    body    := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_payment_reconcile() FROM public, anon, authenticated;

SELECT cron.schedule('reconcile-payments', '*/20 * * * *',
                     'SELECT public.invoke_payment_reconcile();')
WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reconcile-payments');
