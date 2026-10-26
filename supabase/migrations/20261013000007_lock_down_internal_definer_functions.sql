-- Queue — revoke client EXECUTE on internal SECURITY DEFINER functions
--
-- 2026-10-13 audit (C1, C2, C3, H7, M1). Each function below runs as its owner,
-- bypasses RLS, and takes the record it acts on as a caller-supplied argument with
-- no check on who the caller is. All were executable by `anon` (the publishable key
-- shipped in every APK) and `authenticated`, via PostgREST /rpc. Proven in a
-- rolled-back transaction as anon against the TEST fleet:
--
--   anonymize_user(any user id)        -> scrubbed the user's name/email/phone/DOB
--   record_unit_location(any unit id)  -> moved TEST-001's live position
--
-- and by reading the bodies:
--
--   accept_dispatch_offer(offer, p_auth_id) trusts p_auth_id, so anyone could accept
--     any offer as any crew member (the crew check lives only in the API route)
--   get_request_pickup_latlng(request)  returns a patient's pickup coordinates
--   rank_destination_hospitals(request) reads the request's pickup point
--   increment_rate_limit(key, bucket)   lets a client exhaust another user's limit
--   expire_* / flag_* / purge_*         sweepers and retention deletes, run on demand
--
-- Every legitimate caller is either the Next.js API on the service-role client, a
-- pg_cron job (runs as postgres, the owner), or another SECURITY DEFINER function
-- (also runs as the owner) — none of which depend on these grants. Checked
-- 2026-10-13: no app code calls any of them with a user or anon client.
--
-- Postgres grants EXECUTE to PUBLIC by default, so revoking from anon and
-- authenticated alone is not enough; PUBLIC is revoked too.

do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname in (
         'anonymize_user',
         'record_unit_location',
         'accept_dispatch_offer',
         'get_request_pickup_latlng',
         'rank_destination_hospitals',
         'increment_rate_limit',
         'expire_overdue_searches',
         'expire_stale_offers',
         'flag_stale_tracking',
         'purge_expired_operational_data',
         'purge_expired_signup_verifications'
       )
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
