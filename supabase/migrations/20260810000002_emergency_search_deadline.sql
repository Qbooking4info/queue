-- Queue — server-side 60s search deadline (Layer A)
--
-- Stage one of Queue-Ambulance-Stage1-Scope.md. Makes the promise "if we can't,
-- we tell you instantly" true on the server, not just in the app.
--
-- Today an emergency request can sit in 'searching' forever: expire_stale_offers()
-- marks timed-out offers expired and stops there, only a *decline* advances a
-- round, and a crew that simply ignores the push produces no caller at all. The
-- patient watches a spinner with no failure, no alert and no fallback.
--
-- ---------------------------------------------------------------------------
-- WHY THIS IS PURE SQL AND CONTAINS NO HTTP
--
-- The obvious fix is to have the sweeper call the Next.js dispatch engine. That
-- would make the deadline depend on Vercel being up, on CRON_SECRET being set,
-- and on the Vercel plan permitting sub-daily cron — and we already learned the
-- hard way that a cron misconfiguration silently fails the entire deployment.
--
-- A patient being told the truth at 60 seconds must not depend on any of that.
-- So the deadline is enforced by the database on the pg_cron schedule that
-- already runs every 10s (20260729000003). Round *advancement* still needs the
-- HTTP engine and stays best-effort; if it never runs, matching is worse but
-- the request still fails honestly and on time.
--
-- Together with the client-side timer in AmbulanceTrackingScreen, three
-- independent layers have to fail before a patient is left waiting silently.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------

alter table transport_requests
  add column if not exists search_deadline_at timestamptz,
  add column if not exists failure_reason     text;

comment on column transport_requests.search_deadline_at is
  'Emergency only. The instant we stop searching and tell the requester we could not find a unit. NULL for scheduled transport, which has its own longer lifecycle.';

comment on column transport_requests.failure_reason is
  'Why the search ended without a unit. Feeds the coverage-gap dataset used to target supply acquisition.';

create index if not exists transport_requests_deadline_idx
  on transport_requests (search_deadline_at)
  where status in ('requested', 'searching');

-- ---------------------------------------------------------------------------
-- 2. Stamp the deadline in the database, not the application
--
-- Set by trigger so it cannot be forgotten by a caller, and so it holds for any
-- future client. Emergency only: scheduled transport uses a 6-round/600s policy
-- and a 60s budget would kill it the moment it was promoted.
-- ---------------------------------------------------------------------------

create or replace function set_emergency_search_deadline()
returns trigger
language plpgsql
as $$
begin
  if new.request_type = 'emergency' and new.search_deadline_at is null then
    new.search_deadline_at := now() + interval '60 seconds';
  end if;
  return new;
end;
$$;

create trigger transport_search_deadline
  before insert on transport_requests
  for each row execute function set_emergency_search_deadline();

-- ---------------------------------------------------------------------------
-- 3. Allow a pre-assignment request to fail
--
-- The transition guard permits searching -> no_unit_available but not
-- requested -> no_unit_available. That matters: /api/transport/request inserts
-- with status 'requested' and kicks off the first round fire-and-forget. If that
-- call throws (routing outage, RPC error), the row never reaches 'searching' —
-- and the deadline sweeper below would raise instead of failing it honestly,
-- leaving the patient in exactly the silent wait this migration exists to stop.
--
-- Widening only, and only toward giving up: it must always be possible to tell
-- someone the truth, from any state where nobody has been assigned yet.
-- ---------------------------------------------------------------------------

create or replace function enforce_transport_transition()
returns trigger
language plpgsql
as $$
declare
  allowed text[];
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

  insert into transport_events (request_id, from_status, to_status)
  values (new.id, old.status, new.status);

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. The sweeper
-- ---------------------------------------------------------------------------

create or replace function expire_overdue_searches()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  -- One statement, one snapshot. Data-modifying CTEs always run to completion
  -- whether or not the outer query reads them, so the status flip, the offer
  -- withdrawal, the dispatcher alert and the patient notification either all
  -- land or none do. A half-applied expiry — patient told, offers still live —
  -- is precisely the state that gets two crews sent to a cancelled job.
  with expired as (
    -- Only rows where nobody has been assigned. A 'matched' request whose crew
    -- is en route is not overdue no matter what the clock says.
    update transport_requests
       set status         = 'no_unit_available',
           failure_reason = 'search_deadline_exceeded',
           updated_at     = now()
     where status in ('requested', 'searching')
       and search_deadline_at is not null
       and search_deadline_at <= now()
    returning id, requester_id, triage_level
  ),
  -- Withdraw anything still outstanding so a crew can't accept a job the
  -- requester has already been told is dead.
  withdrawn as (
    update dispatch_offers o
       set response = 'expired', responded_at = now()
      from expired e
     where o.request_id = e.id and o.response = 'pending'
    returning o.id
  ),
  -- NULL triage falls through to 'high', which is correct: an untriaged
  -- request is not automatically the least urgent one.
  alerted as (
    insert into dispatcher_alerts (request_id, severity, kind, message)
    select e.id,
           case when e.triage_level <= 2 then 'critical' else 'high' end,
           'no_unit_available',
           'Search deadline exceeded with no unit assigned. Manual intervention needed.'
      from expired e
    returning id
  ),
  -- show_emergency_fallback is what the app keys on to raise the directory to
  -- its primary surface.
  notified as (
    insert into notifications (user_id, type, title, body, data, is_read, sent_via)
    select e.requester_id,
           'transport',
           'No ambulance available',
           'We could not reach an available ambulance. Please call emergency services directly.',
           jsonb_build_object('request_id', e.id, 'show_emergency_fallback', true),
           false,
           array['in_app']
      from expired e
    returning id
  )
  select count(*) into v_count from expired;

  return v_count;
end;
$$;

comment on function expire_overdue_searches() is
  'Layer A of the 60s emergency deadline. Deliberately free of any HTTP dependency so the promise holds when the application tier is down.';

-- ---------------------------------------------------------------------------
-- 5. Schedule
--
-- 10s, matching the existing offer sweeper. Worst-case overshoot is ~10s on a
-- 60s budget; the client-side timer covers the patient-facing message exactly
-- at 60 regardless.
-- ---------------------------------------------------------------------------

select cron.schedule('expire-overdue-searches', '10 seconds', $$select expire_overdue_searches();$$);
