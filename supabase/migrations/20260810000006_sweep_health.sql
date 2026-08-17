-- Queue — observability for the database-driven sweep
--
-- invoke_transport_sweep() is fire-and-forget: net.http_post queues the request
-- and returns immediately, which is what keeps a dead endpoint from stalling the
-- cron worker shared with the other sweepers. The cost is that a failing sweep
-- is completely silent — the cron job succeeds whether Vercel answered 200, 401
-- or never answered at all.
--
-- That matters because the failure mode is invisible by construction: a wrong
-- CRON_SECRET, an expired deployment URL or a Vercel outage all look identical
-- to "working" from inside Postgres. This exposes the delivery result so the
-- scheduler can actually be checked rather than assumed.

create or replace function transport_sweep_health()
returns table (
  last_attempt_at   timestamptz,
  last_status_code  integer,
  last_error        text,
  ok_last_hour      integer,
  failed_last_hour  integer,
  is_configured     boolean,
  cron_active       boolean
)
language sql
stable
security definer
set search_path = public, net, cron
as $$
  with cfg as (
    select
      (select count(*) = 2 from app_config where key in ('transport_sweep_url','cron_secret')) as configured
  ),
  job as (
    select coalesce(bool_or(active), false) as active
      from cron.job where jobname = 'invoke-transport-sweep'
  ),
  -- Only responses for the sweep endpoint; net._http_response is shared with
  -- any other pg_net caller.
  resp as (
    select r.status_code, r.error_msg, r.created
      from net._http_response r
     order by r.created desc
     limit 200
  )
  select
    (select created      from resp order by created desc limit 1),
    (select status_code  from resp order by created desc limit 1),
    (select error_msg    from resp order by created desc limit 1),
    (select count(*)::int from resp where created > now() - interval '1 hour' and status_code between 200 and 299),
    (select count(*)::int from resp where created > now() - interval '1 hour' and (status_code is null or status_code >= 400)),
    (select configured from cfg),
    (select active from job);
$$;

comment on function transport_sweep_health() is
  'Delivery status of the pg_net-driven /api/transport/sweep tick. last_status_code 401 means CRON_SECRET disagrees between Vercel and app_config; null with an error means the endpoint was unreachable.';

revoke all on function transport_sweep_health() from public, anon, authenticated;
