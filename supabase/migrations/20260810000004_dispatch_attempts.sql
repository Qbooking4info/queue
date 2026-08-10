-- Queue — dispatch attempt instrumentation
--
-- Step 4 of Queue-Ambulance-Stage1-Scope.md. Turns every failed search into the
-- dataset that answers the question the whole product is blocked on: where does
-- supply come from?
--
-- find_candidate_units returns only units that already passed every filter, so
-- when it returns nothing we currently learn nothing. "No unit available" could
-- mean the nearest rig was 40km away, or that one was parked 300m away but off
-- duty, or that three were on duty but all mid-job. Those are completely
-- different problems — the first is a coverage gap, the second is an adoption
-- problem, the third is a capacity problem — and they need completely different
-- responses.
--
-- nearest_unit_m is the column that matters. "40 unserved calls in Surulere,
-- nearest rig averaged 14km" is the pitch to the next fleet operator, and the
-- empirical answer to a question currently being guessed at.

create table dispatch_attempts (
  id                      uuid primary key default gen_random_uuid(),
  request_id              uuid not null references transport_requests(id) on delete cascade,
  round                   smallint not null,
  radius_m                integer not null,

  -- Survivors of the SQL filters in find_candidate_units.
  candidates_found        integer not null default 0,
  -- Survivors of hardFilter() in matching.ts (tier, capability, shift headroom).
  candidates_after_filter integer not null default 0,
  -- Tally keyed by RejectReason, e.g. {"tier_too_low": 2, "shift_too_short": 1}.
  reject_reasons          jsonb   not null default '{}'::jsonb,
  offers_made             integer not null default 0,

  -- Supply context, measured regardless of whether anything was dispatchable.
  nearest_unit_m          double precision,
  active_units_total      integer,
  on_duty_units_total     integer,

  created_at              timestamptz not null default now()
);

create index dispatch_attempts_request_idx on dispatch_attempts (request_id, round);
create index dispatch_attempts_time_idx    on dispatch_attempts (created_at desc);
-- Partial index for the query that actually matters: unserved rounds.
create index dispatch_attempts_gaps_idx    on dispatch_attempts (created_at desc)
  where candidates_after_filter = 0;

comment on column dispatch_attempts.nearest_unit_m is
  'Distance to the nearest active unit even if it was unusable — off duty, mid-job, or stale. This is the coverage-gap signal; candidates_found only ever counts units that already passed every filter.';

alter table dispatch_attempts enable row level security;
-- No client reads this. It is written by the dispatch engine (service role) and
-- read by operators through the dashboard, which also uses the service role.
revoke all on dispatch_attempts from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Supply context at the moment of a dispatch round
--
-- Deliberately ignores every filter find_candidate_units applies. Falls back to
-- home_base when a unit has never reported a position — home_base is NOT NULL
-- on ambulances, so a distance is always available, and "the nearest rig is
-- based 14km away" is exactly the signal we want even for a unit that has never
-- opened the crew app.
-- ---------------------------------------------------------------------------
create or replace function nearest_unit_stats(p_request_id uuid)
returns table (
  nearest_unit_m      double precision,
  active_units_total  integer,
  on_duty_units_total integer
)
language sql
stable
security definer
set search_path = public
as $$
  with req as (
    select pickup_point from transport_requests where id = p_request_id
  ),
  units as (
    select a.id,
           a.status,
           coalesce(loc.location, a.home_base) as position
      from ambulances a
      join ambulance_providers p on p.id = a.provider_id
      left join ambulance_current_location loc on loc.ambulance_id = a.id
     where a.is_active and p.is_active
  )
  select
    (select min(ST_Distance(u.position, r.pickup_point)) from units u, req r),
    (select count(*)::int from units),
    (select count(*)::int from units where status = 'available');
$$;

revoke all on function nearest_unit_stats(uuid) from public, anon, authenticated;
