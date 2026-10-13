-- Queue — dispatcher alerts for emergencies with no destination reach someone
--
-- 2026-10-13 audit (REP-017). Alert readers (dashboard inbox, hospital app) scoped
-- alerts by transport_requests.destination_hospital_id. An emergency has no
-- destination until a crew picks one, and a "no unit available" alert is exactly
-- the case where no crew ever did — so those alerts matched no hospital at all.
-- In prod 31 of 77 alerts had no destination; nobody could see them.
--
-- A hospital now also sees an alert whose request has no destination when it runs
-- its own fleet (it can send a unit or phone the caller) and the pickup point is
-- within its ambulance service radius (50 km when unset). Patient contact details
-- go only to hospitals that can act on them, not to every hospital in the city.
-- Platform super admins see every alert through the API.

create or replace function public.dispatcher_alert_ids_for_hospital(p_hospital_id uuid, p_limit integer default 100)
returns table (alert_id uuid)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select da.id
    from dispatcher_alerts da
    join transport_requests tr on tr.id = da.request_id
    join hospitals h on h.id = p_hospital_id
   where tr.destination_hospital_id = p_hospital_id
      or (
        tr.destination_hospital_id is null
        and h.latitude is not null and h.longitude is not null
        and exists (select 1 from ambulance_providers ap where ap.hospital_id = p_hospital_id)
        and ST_DWithin(
              tr.pickup_point,
              ST_SetSRID(ST_MakePoint(h.longitude, h.latitude), 4326)::geography,
              coalesce(h.ambulance_service_radius_m, 50000))
      )
   order by da.created_at desc
   limit p_limit;
$$;

comment on function public.dispatcher_alert_ids_for_hospital(uuid, integer) is
  'Dispatcher alerts a hospital may see: its own destination requests, plus destination-less requests inside its fleet''s service radius (REP-017).';

-- Called only by the server (service role) after it has resolved the caller's hospital.
revoke all on function public.dispatcher_alert_ids_for_hospital(uuid, integer) from public, anon, authenticated;
grant execute on function public.dispatcher_alert_ids_for_hospital(uuid, integer) to service_role;
