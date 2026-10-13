-- Ambulance trips could never finish, and units never came back.
--
-- Found in the 2026-10-13 emulator end-to-end run (AMB-961338):
--   1. Nothing could move a trip past arrived_at_destination. 'completed' needs a
--      disposition (completed_has_disposition) and no UI or RPC ever wrote one.
--   2. accept_dispatch_offer() sets ambulances.status = 'assigned' and nothing
--      ever set it back. Once a unit took one job it was undispatchable forever
--      (find_candidate_units only offers 'available' units).
--   3. transport_events rows for crew status changes had null actor_id/actor_role.
--
-- Fixes:
--   - crew_complete_job(): the crew closes the job with a disposition. From
--     arrived_at_destination it is always 'transported'; from on_scene the crew picks
--     one of the non-transport outcomes. Many receiving facilities are not on Queue,
--     so the crew, who is there, records the handover.
--   - release_unit_after_transport trigger: when a trip ends (completed or any
--     cancellation) or is put back to 'searching', the unit returns to 'available'
--     when it still has a live shift, otherwise to 'offline'.
--   - enforce_transport_transition() records the actor: the caller's users.id plus
--     a role taken from the queue.actor_role setting, or 'requester' or 'system'.

-- 1 ── actor on every transition ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_transport_transition()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  allowed text[];
  v_actor uuid;
  v_role  text;
begin
  if new.status = old.status then
    return new;
  end if;

  allowed := case old.status
    when 'requested'              then array['searching','no_unit_available','cancelled_by_requester']
    when 'scheduled'              then array['searching','no_unit_available','cancelled_by_requester']
    when 'searching'              then array['matched','no_unit_available','cancelled_by_requester']
    when 'matched'                then array['en_route_to_patient','searching','cancelled_by_requester','cancelled_by_provider']
    when 'en_route_to_patient'    then array['on_scene','searching','cancelled_by_requester','cancelled_by_provider']
    when 'on_scene'               then array['transporting','completed','cancelled_by_provider']
    when 'transporting'           then array['arrived_at_destination','cancelled_by_provider']
    when 'arrived_at_destination' then array['completed']
    else array[]::text[]
  end;

  if not (new.status = any(allowed)) then
    raise exception 'invalid transport transition: % -> %', old.status, new.status
      using errcode = 'check_violation';
  end if;

  if auth.uid() is not null then
    select id into v_actor from public.users where auth_id = auth.uid();
  end if;
  v_role := nullif(current_setting('queue.actor_role', true), '');
  if v_role is null then
    v_role := case
      when new.status = 'cancelled_by_requester' then 'requester'
      when auth.uid() is null then 'system'
      else null
    end;
  end if;

  insert into transport_events (request_id, from_status, to_status, actor_id, actor_role)
  values (new.id, old.status, new.status, v_actor, v_role);

  if new.status = 'completed' and new.completed_at is null then
    new.completed_at := now();
  end if;

  return new;
end;
$function$;

-- 2 ── release the unit when the trip no longer needs it ─────────────────────
CREATE OR REPLACE FUNCTION public.release_unit_after_transport()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
declare
  v_unit uuid := old.assigned_unit_id;
begin
  if v_unit is null or new.status = old.status then
    return null;
  end if;
  if new.status not in ('completed','cancelled_by_requester','cancelled_by_provider',
                        'no_unit_available','searching') then
    return null;
  end if;
  -- Still carrying another live job (should not happen, but never free a busy rig).
  if exists (select 1 from transport_requests r
              where r.assigned_unit_id = v_unit and r.id <> new.id
                and r.status in ('matched','en_route_to_patient','on_scene','transporting','arrived_at_destination')) then
    return null;
  end if;

  update ambulances a
     set status = case when exists (select 1 from ambulance_shifts s
                                     where s.ambulance_id = a.id and now() between s.starts_at and s.ends_at)
                       then 'available' else 'offline' end,
         updated_at = now()
   where a.id = v_unit and a.status in ('assigned','busy');
  return null;
end;
$function$;

DROP TRIGGER IF EXISTS release_unit_after_transport ON public.transport_requests;
CREATE TRIGGER release_unit_after_transport
  AFTER UPDATE OF status ON public.transport_requests
  FOR EACH ROW EXECUTE FUNCTION public.release_unit_after_transport();

-- 3 ── crew-side status changes carry the crew role ──────────────────────────
CREATE OR REPLACE FUNCTION public.crew_update_job_status(p_request_id uuid, p_new_status text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_unit_id uuid;
  v_updated integer;
begin
  if p_new_status not in ('en_route_to_patient', 'on_scene', 'transporting', 'arrived_at_destination') then
    raise exception 'crew_update_job_status: % is not a crew-drivable status', p_new_status
      using errcode = 'check_violation';
  end if;

  v_unit_id := public.my_crew_unit_for_request(p_request_id);
  if v_unit_id is null then
    return false;
  end if;

  perform set_config('queue.actor_role', 'crew', true);
  update transport_requests
     set status = p_new_status, updated_at = now()
   where id = p_request_id;

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$function$;

-- The caller's unit for this request, if the caller is on a live shift crewing it.
CREATE OR REPLACE FUNCTION public.my_crew_unit_for_request(p_request_id uuid)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select r.assigned_unit_id
    from transport_requests r
   where r.id = p_request_id
     and r.assigned_unit_id in (
       select s.ambulance_id
         from ambulance_shifts s
         join ambulance_shift_crew sc on sc.shift_id = s.id
        where now() between s.starts_at and s.ends_at
          and (
            sc.crew_member_id in (
              select c.id from ambulance_crew c
               where c.user_id = (select id from users where auth_id = auth.uid()) and c.is_active
            )
            or sc.hospital_admin_id in (
              select ha.id from hospital_admins ha
               where ha.user_id = (select id from users where auth_id = auth.uid())
                 and ha.role = 'ambulance_crew' and ha.is_active
            )
          )
     );
$function$;
REVOKE ALL ON FUNCTION public.my_crew_unit_for_request(uuid) FROM PUBLIC, anon, authenticated;

-- 4 ── crew closes the job ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.crew_complete_job(p_request_id uuid, p_disposition text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_status  text;
  v_updated integer;
begin
  if public.my_crew_unit_for_request(p_request_id) is null then
    return false;
  end if;

  select status into v_status from transport_requests where id = p_request_id for update;

  if v_status = 'arrived_at_destination' then
    if p_disposition is distinct from 'transported' then
      raise exception 'crew_complete_job: a trip that reached the destination is closed as transported'
        using errcode = 'check_violation';
    end if;
  elsif v_status = 'on_scene' then
    if p_disposition not in ('treated_not_transported','patient_refused','no_patient_found','deceased_on_scene') then
      raise exception 'crew_complete_job: % is not a valid on-scene outcome', p_disposition
        using errcode = 'check_violation';
    end if;
  else
    raise exception 'crew_complete_job: cannot complete a job in status %', v_status
      using errcode = 'check_violation';
  end if;

  perform set_config('queue.actor_role', 'crew', true);
  update transport_requests
     set status = 'completed', disposition = p_disposition,
         completed_at = now(), updated_at = now()
   where id = p_request_id;

  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$function$;
REVOKE ALL ON FUNCTION public.crew_complete_job(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crew_complete_job(uuid, text) TO authenticated;

-- 5 ── free units stranded by the old behaviour ──────────────────────────────
UPDATE public.ambulances a
   SET status = case when exists (select 1 from ambulance_shifts s
                                   where s.ambulance_id = a.id and now() between s.starts_at and s.ends_at)
                     then 'available' else 'offline' end,
       updated_at = now()
 WHERE a.status in ('assigned','busy')
   AND NOT EXISTS (select 1 from transport_requests r
                    where r.assigned_unit_id = a.id
                      and r.status in ('matched','en_route_to_patient','on_scene','transporting','arrived_at_destination'));
