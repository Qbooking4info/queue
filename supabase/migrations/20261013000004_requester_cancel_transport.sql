-- Patients could never cancel an ambulance request.
--
-- The mobile cancelTransport() did a direct UPDATE on transport_requests, but the
-- table has no UPDATE policy for the requester, so RLS matched zero rows and
-- returned no error. The app showed the request as cancelled while the crew kept
-- driving. Found in the 2026-10-13 emulator run (AMB-174449).
--
-- Cancellation now goes through this RPC. Only the requester can cancel, and only
-- before the crew is on scene (the same window enforce_transport_transition allows).
-- Pending offers are withdrawn, and release_unit_after_transport frees the unit.
CREATE OR REPLACE FUNCTION public.cancel_my_transport(p_request_id uuid, p_reason text DEFAULT NULL)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_updated integer;
begin
  update transport_requests
     set status = 'cancelled_by_requester',
         cancellation_reason = left(p_reason, 500),
         updated_at = now()
   where id = p_request_id
     and requester_id = (select id from users where auth_id = auth.uid())
     and status in ('requested','scheduled','searching','matched','en_route_to_patient');
  get diagnostics v_updated = row_count;

  if v_updated > 0 then
    update dispatch_offers set response = 'expired', responded_at = now()
     where request_id = p_request_id and response = 'pending';
  end if;
  return v_updated > 0;
end;
$function$;
REVOKE ALL ON FUNCTION public.cancel_my_transport(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_my_transport(uuid, text) TO authenticated;
