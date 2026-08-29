-- Queue — notice that nobody is on shift BEFORE a patient does
--
-- The 2026-08-28 audit found the ambulance service had never completed a single
-- dispatch. The engine bug is fixed and proven, but the funnel probe exposed the
-- other half of the problem, which no code change can solve:
--
--   units_total 3 · units_active 3 · units_free 2 · units_on_shift 0
--
-- There is no rota. Units exist, nobody is signed on to them. Today that fact
-- only becomes visible when someone in an emergency opens the app, waits out the
-- 60-second promise, and is told no ambulance could be reached. The operator
-- learns about it after the patient does, if at all.
--
-- This turns it into a signal that arrives first. A quarter-hourly check: if the
-- network has zero dispatchable units, raise a dispatcher alert. The alert relay
-- (web/src/lib/dispatch/alert-relay.ts) carries it to a phone when
-- DISPATCH_ALERT_* is configured.
--
-- Deliberately conservative about noise:
--   * one open alert at a time — it re-raises only after the previous one is
--     acknowledged or the gap closes and reopens
--   * kind = 'no_coverage', so it can be filtered separately from per-request
--     failures in the dispatcher inbox
--
-- This does not fix coverage. Nothing in software can. It makes the gap
-- impossible to be unaware of, which is the necessary first step.

create or replace function check_ambulance_coverage()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dispatchable integer;
  v_on_shift     integer;
  v_open_alert   uuid;
  v_raised       integer := 0;
begin
  select count(*) into v_on_shift
    from ambulances a
    join ambulance_providers p on p.id = a.provider_id
    join ambulance_shifts s    on s.ambulance_id = a.id
   where a.is_active and p.is_active
     and now() between s.starts_at and s.ends_at;

  select count(*) into v_dispatchable
    from ambulances a
    join ambulance_providers p on p.id = a.provider_id
    join ambulance_shifts s    on s.ambulance_id = a.id
    join ambulance_current_location loc on loc.ambulance_id = a.id
   where a.is_active and p.is_active
     and a.status = 'available'
     and now() between s.starts_at and s.ends_at
     and loc.recorded_at > now() - make_interval(secs => unit_location_max_age_seconds());

  -- An unacknowledged no_coverage alert already standing? Say it once.
  select id into v_open_alert
    from dispatcher_alerts
   where kind = 'no_coverage'
     and acknowledged_at is null
   order by created_at desc
   limit 1;

  if v_dispatchable = 0 and v_open_alert is null then
    insert into dispatcher_alerts (request_id, severity, kind, message)
    values (
      null,
      'critical',
      'no_coverage',
      format(
        'NO DISPATCHABLE AMBULANCE on the whole network. %s unit(s) on shift, %s reporting a usable position. Any emergency request right now will fail.',
        v_on_shift, v_dispatchable
      )
    );
    v_raised := 1;
  end if;

  return v_raised;
end;
$$;

comment on function check_ambulance_coverage() is
  'Raises a critical dispatcher alert when the network has zero dispatchable units, so an empty rota is discovered by the operator rather than by a patient in an emergency. One open alert at a time.';

revoke all on function check_ambulance_coverage() from public, anon, authenticated;

-- request_id is NOT NULL on dispatcher_alerts in the original schema; a
-- coverage alert belongs to no particular request, so it has to be nullable.
alter table dispatcher_alerts alter column request_id drop not null;

-- Every 15 minutes. Frequent enough that a gap is caught within a quarter hour,
-- infrequent enough that an overnight gap is one alert rather than ninety.
select cron.unschedule('check-ambulance-coverage')
 where exists (select 1 from cron.job where jobname = 'check-ambulance-coverage');

select cron.schedule(
  'check-ambulance-coverage',
  '*/15 * * * *',
  $$select check_ambulance_coverage();$$
);
