-- Queue — drive /api/transport/sweep from Postgres (Layer B)
--
-- Layer B advances dispatch rounds within the 60s emergency budget. It has never
-- had a trigger. The original plan was Vercel Cron, but this project is on the
-- Hobby plan, which caps crons at once per day AND fails the entire deployment
-- when it sees a sub-daily schedule — that is what took the site down earlier
-- and why web/vercel.json was removed.
--
-- So the scheduler moves to where the other sweepers already live. pg_cron is
-- already running expire_stale_offers (10s), flag_stale_tracking (30s) and
-- expire_overdue_searches (10s); pg_net lets one of those jobs make the HTTP
-- call that pg_cron alone cannot.
--
-- Layer A (expire_overdue_searches) remains pure SQL with no HTTP dependency, so
-- if this call fails the request is still failed honestly and on time. This only
-- improves matching within the window — it is not load-bearing for the promise.
--
-- ---------------------------------------------------------------------------
-- THE SECRET IS NOT IN THIS FILE
--
-- migrations are committed to a public repository. The bearer token lives in
-- app_config, inserted out-of-band, and this migration only creates the empty
-- table. invoke_transport_sweep() no-ops when the row is absent, so applying
-- this migration on a fresh environment is safe and inert until configured.
-- ---------------------------------------------------------------------------

create extension if not exists pg_net with schema extensions;

create table if not exists app_config (
  key         text primary key,
  value       text not null,
  updated_at  timestamptz not null default now()
);

comment on table app_config is
  'Server-side configuration for database-initiated HTTP calls. Contains secrets; no client role may read it.';

alter table app_config enable row level security;
revoke all on app_config from anon, authenticated;
-- No policy at all: only the service role and SECURITY DEFINER functions reach it.

-- ---------------------------------------------------------------------------
-- The tick
-- ---------------------------------------------------------------------------
create or replace function invoke_transport_sweep()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_url    text;
  v_secret text;
begin
  select value into v_url    from app_config where key = 'transport_sweep_url';
  select value into v_secret from app_config where key = 'cron_secret';

  -- Unconfigured is not an error. A fresh environment should stay quiet rather
  -- than log a failure every 30 seconds.
  if v_url is null or v_secret is null then
    return;
  end if;

  -- Fire and forget. net.http_post queues the request and returns immediately,
  -- so a slow or dead endpoint cannot block the cron worker and stall the other
  -- sweepers sharing it.
  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || v_secret
               ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 8000
  );
end;
$$;

revoke all on function invoke_transport_sweep() from public, anon, authenticated;

-- 30s: the tightest emergency offer TTL is 30s, so this bounds how long a round
-- sits idle after its offers lapse. Layer A still enforces the 60s deadline
-- independently, so a missed tick costs matching quality, never the promise.
select cron.schedule('invoke-transport-sweep', '30 seconds', $$select invoke_transport_sweep();$$);
