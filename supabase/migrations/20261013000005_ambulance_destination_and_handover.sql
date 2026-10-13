-- Make the ambulance flow work for all three parties.
--
-- Nothing ever set transport_requests.destination_hospital_id. Patients don't pick
-- one, and rank_destination_hospitals() needs hospital coordinates that most rows
-- don't have. So every hospital's "Inbound ambulances" desk stayed empty, even for
-- a patient being driven to its door.
--
--   crew_destination_options()   hospitals the crew can take this patient to, nearest first
--   crew_set_destination()       the crew picks one (any time before arrival)
--   hospital_receive_transport() the receiving hospital confirms the handover
--                                (service_role only; the API route checks staff membership)
--   get_my_transport_details()   what the patient sees: unit, operator phone,
--                                destination and outcome

-- 1 ── destination options for the crew ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.crew_destination_options(p_request_id uuid)
 RETURNS TABLE(hospital_id uuid, name text, address text, phone text,
               distance_m double precision, is_24_hours boolean, bed_space_status text, is_current boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with req as (
    select r.id, r.pickup_point, r.destination_hospital_id, p.hospital_id as fleet_hospital_id
      from transport_requests r
      join ambulances a on a.id = r.assigned_unit_id
      join ambulance_providers p on p.id = a.provider_id
     where r.id = p_request_id
       and public.my_crew_unit_for_request(p_request_id) is not null
  )
  select h.id, h.name, h.address, h.phone,
         case when h.latitude is not null and h.longitude is not null and req.pickup_point is not null
              then ST_Distance(req.pickup_point, ST_SetSRID(ST_MakePoint(h.longitude, h.latitude), 4326)::geography)
         end as distance_m,
         h.is_24_hours, h.bed_space_status,
         h.id = req.destination_hospital_id
    from req
    join hospitals h on h.is_active
                    and (h.is_verified or h.id = req.fleet_hospital_id or h.id = req.destination_hospital_id)
   order by (h.id = req.destination_hospital_id) desc,
            (h.id = req.fleet_hospital_id) desc,
            distance_m asc nulls last, h.name
   limit 25;
$function$;
REVOKE ALL ON FUNCTION public.crew_destination_options(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crew_destination_options(uuid) TO authenticated;

-- 2 ── crew sets the destination ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.crew_set_destination(p_request_id uuid, p_hospital_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_updated integer;
begin
  if not exists (select 1 from public.crew_destination_options(p_request_id) o where o.hospital_id = p_hospital_id) then
    return false;
  end if;

  update transport_requests
     set destination_hospital_id = p_hospital_id, updated_at = now()
   where id = p_request_id
     and status in ('matched','en_route_to_patient','on_scene','transporting');
  get diagnostics v_updated = row_count;
  return v_updated > 0;
end;
$function$;
REVOKE ALL ON FUNCTION public.crew_set_destination(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crew_set_destination(uuid, uuid) TO authenticated;

-- 3 ── receiving hospital confirms handover ──────────────────────────────────
-- Called by POST /api/ambulances/receive with the service role, after the route
-- has checked the caller is staff at p_hospital_id. A crew that hasn't tapped
-- "Arrived" yet is stepped through it, so the audit trail stays complete.
CREATE OR REPLACE FUNCTION public.hospital_receive_transport(p_request_id uuid, p_hospital_id uuid, p_actor_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_status text;
begin
  select status into v_status from transport_requests
   where id = p_request_id and destination_hospital_id = p_hospital_id
   for update;
  if v_status is null or v_status not in ('transporting','arrived_at_destination') then
    return false;
  end if;

  perform set_config('queue.actor_role', 'hospital', true);
  if v_status = 'transporting' then
    update transport_requests set status = 'arrived_at_destination', updated_at = now() where id = p_request_id;
  end if;
  update transport_requests
     set status = 'completed', disposition = 'transported', completed_at = now(), updated_at = now()
   where id = p_request_id;

  update transport_events set actor_id = p_actor_user_id
   where request_id = p_request_id and actor_role = 'hospital' and actor_id is null;
  return true;
end;
$function$;
REVOKE ALL ON FUNCTION public.hospital_receive_transport(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- 4 ── what the patient sees ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_transport_details(p_request_id uuid)
 RETURNS TABLE(plate_number text, call_sign text, vehicle_tier text,
               provider_name text, provider_phone text,
               destination_name text, destination_address text, destination_phone text,
               disposition text, completed_at timestamptz)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select a.plate_number, a.call_sign, a.vehicle_tier,
         p.name, p.contact_phone,
         h.name, h.address, h.phone,
         r.disposition, r.completed_at
    from transport_requests r
    left join ambulances a          on a.id = r.assigned_unit_id
    left join ambulance_providers p on p.id = a.provider_id
    left join hospitals h           on h.id = r.destination_hospital_id
   where r.id = p_request_id
     and (r.requester_id = (select id from users where auth_id = auth.uid())
          or r.patient_id = (select id from users where auth_id = auth.uid()));
$function$;
REVOKE ALL ON FUNCTION public.get_my_transport_details(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_transport_details(uuid) TO authenticated;

-- 5 ── crew sees the destination's phone (for a pre-arrival call) ────────────
DROP FUNCTION IF EXISTS public.get_my_active_job();
CREATE FUNCTION public.get_my_active_job()
 RETURNS TABLE(request_id uuid, booking_ref text, status text, assigned_unit_id uuid, triage_level smallint,
               symptom_description text, contact_phone text, pickup_address text,
               pickup_lat double precision, pickup_lng double precision,
               destination_hospital_id uuid, destination_hospital_name text,
               eta_seconds integer, eta_updated_at timestamp with time zone,
               destination_hospital_phone text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select r.id, r.booking_ref, r.status, r.assigned_unit_id, r.triage_level, r.symptom_description,
         r.contact_phone, r.pickup_address,
         ST_Y(r.pickup_point::geometry), ST_X(r.pickup_point::geometry),
         r.destination_hospital_id, h.name,
         r.eta_seconds, r.eta_updated_at,
         h.phone
    from transport_requests r
    left join hospitals h on h.id = r.destination_hospital_id
   where r.status in ('matched','en_route_to_patient','on_scene','transporting','arrived_at_destination')
     and public.my_crew_unit_for_request(r.id) is not null
   limit 1;
$function$;
REVOKE ALL ON FUNCTION public.get_my_active_job() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_active_job() TO authenticated;
