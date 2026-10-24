-- pgTAP: internal SECURITY DEFINER functions must not be callable by clients.
--
-- Regression for 20261013000007_lock_down_internal_definer_functions.sql. These
-- take the record they act on as an argument and never check the caller, so an
-- EXECUTE grant to anon/authenticated is a direct hole (anon could anonymize any
-- user and move any ambulance). Read-only: no fixtures, safe against any database.

begin;
create extension if not exists pgtap with schema extensions;

select plan(22);

select ok(not has_function_privilege(r.role, p.oid, 'execute'),
          format('%s cannot execute %s', r.role, p.proname))
  from pg_proc p
 cross join (values ('anon'), ('authenticated')) r(role)
 where p.pronamespace = 'public'::regnamespace
   and p.proname in (
     'anonymize_user', 'record_unit_location', 'accept_dispatch_offer',
     'get_request_pickup_latlng', 'rank_destination_hospitals', 'increment_rate_limit',
     'expire_overdue_searches', 'expire_stale_offers', 'flag_stale_tracking',
     'purge_expired_operational_data', 'purge_expired_signup_verifications'
   )
 order by p.proname, r.role;

select * from finish();
rollback;
