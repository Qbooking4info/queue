-- Queue — server-side read of a request's live patient position
--
-- The live-ETA recompute needs the patient's current position as a plain
-- lat/lng. It runs on the service-role client, so RLS is not the obstacle —
-- the geography column is: PostgREST hands `geography` back as WKB hex, which
-- the dispatch code would have to decode itself.
--
-- get_request_pickup_latlng() already exists for exactly this reason
-- (dispatch/engine.ts uses it for the static pickup point). This is its
-- counterpart for the live position, so the ETA can aim at where the patient
-- is now rather than where they booked from.
--
-- Not granted to authenticated: clients that need this use
-- get_job_patient_location(), which carries the participant check. This one is
-- for server-side callers that have already established who they are.

create or replace function get_request_patient_latlng(p_request_id uuid)
returns table (lat double precision, lng double precision, recorded_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select ST_Y(l.location::geometry), ST_X(l.location::geometry), l.recorded_at
    from transport_patient_location l
   where l.request_id = p_request_id;
$$;

comment on function get_request_patient_latlng(uuid) is
  'Live requester position for a transport request, as lat/lng. Server-side callers only — clients use get_job_patient_location(), which checks participation.';

revoke all on function get_request_patient_latlng(uuid) from public, anon, authenticated;
grant execute on function get_request_patient_latlng(uuid) to service_role;
