-- Queue — stop a missed GPS ping from deleting an ambulance from the network
--
-- THE PROBLEM THIS FIXES, in production numbers as of 2026-08-28:
--
--   transport requests ever      11   -> all 11 no_unit_available
--   dispatch offers ever made     0
--   every dispatch_attempt row    candidates_found = 0
--
-- Not one request has ever reached a crew. `find_candidate_units` requires
-- `loc.recorded_at > now() - interval '2 minutes'`, and that single predicate is
-- what empties every round: a unit is invisible to dispatch unless it pinged in
-- the last 120 seconds. On Android, with battery optimisation free to suspend a
-- background task, a crew can be sitting on duty in their ambulance and be
-- invisible because the last fix was three minutes ago.
--
-- Freshness genuinely matters — dispatching to a position an hour old is worse
-- than not dispatching. But a hard cutoff treats 121 seconds exactly like an
-- hour, and that is the wrong shape for the failure. A unit that pinged four
-- minutes ago is almost certainly still roughly where it says.
--
-- So the cutoff becomes a wide outer bound (how stale is *implausible*) and the
-- ranking takes over inside it (how stale is *worse*). The scoring change lives
-- in web/src/lib/dispatch/matching.ts; this migration supplies the data it
-- needs and widens the gate.
--
-- Kept deliberately conservative: 10 minutes, not an hour. Past that a position
-- says nothing useful about a moving vehicle in Lagos traffic.

-- ---------------------------------------------------------------------------
-- 1. Two windows instead of one
-- ---------------------------------------------------------------------------

create or replace function unit_location_max_age_seconds()
returns integer
language sql
immutable
parallel safe
as $$ select 600 $$;

comment on function unit_location_max_age_seconds() is
  'Outer bound for dispatchability: a unit whose last fix is older than this is not offered work at all. Inside it, staleness is a ranking penalty rather than an exclusion (see matching.ts). Distinct from unit_location_ttl_seconds(), which is the tighter "is this unit live on the dashboard" window.';

-- unit_location_ttl_seconds() stays at 120s and keeps its own job: it drives
-- `visible_to_dispatch` in get_my_units(), which is what tells a crew member
-- their own unit looks live. Crews should still see a warning at two minutes —
-- that is a useful nudge to check the app. It just no longer decides whether
-- they can be sent a job.

-- ---------------------------------------------------------------------------
-- 2. find_candidate_units: widen the gate, return the staleness
-- ---------------------------------------------------------------------------
--
-- Same body as 20260730000001 with two changes: the freshness predicate uses
-- the wider bound, and the result carries location_age_seconds so the ranker can
-- price it. Postgres cannot change a function's OUT columns in place, so the
-- old signature is dropped first.

drop function if exists find_candidate_units(uuid, integer, integer);

-- Reproduced verbatim from 20260730000001 with two edits only: the freshness
-- predicate, and location_age_seconds added to the output. Every hard guard is
-- preserved -- in particular the three `not exists` clauses that keep a unit
-- with an active job, a live offer elsewhere, or an imminent scheduled job out
-- of the candidate set. Rewriting this from memory would have silently dropped
-- them and allowed dispatch to offer work to an ambulance with a patient aboard.

create or replace function find_candidate_units(
  p_request_id uuid,
  p_radius_m   integer default 15000,
  p_limit      integer default 12
)
returns table (
  unit_id              uuid,
  provider_id          uuid,
  provider_type        text,
  provider_hospital_id uuid,
  reliability_score    numeric,
  vehicle_tier         text,
  crew_tier            text,
  capabilities         text[],
  current_lat          double precision,
  current_lng          double precision,
  straight_line_m      double precision,
  shift_ends_at        timestamptz,
  last_dispatched_at   timestamptz,
  location_age_seconds integer
)
language sql
stable
security definer
set search_path = public
as $$
  with req as (
    select r.id, r.pickup_point, r.required_tier, r.required_capabilities, r.destination_hospital_id,
           coalesce(r.scheduled_for, now()) as reference_time
      from transport_requests r
     where r.id = p_request_id
  ),
  live as (
    select a.id as unit_id, a.provider_id, a.vehicle_tier, a.capabilities,
           p.provider_type, p.hospital_id as provider_hospital_id, p.reliability_score,
           loc.location, s.crew_tier, s.ends_at as shift_ends_at,
           extract(epoch from (now() - loc.recorded_at))::int as location_age_seconds
      from ambulances a
      join ambulance_providers p           on p.id = a.provider_id
      join ambulance_current_location loc  on loc.ambulance_id = a.id
      join ambulance_shifts s              on s.ambulance_id = a.id
      left join hospitals h                on h.id = p.hospital_id
      cross join req
     where a.is_active
       and p.is_active
       and a.status = 'available'
       and req.reference_time between s.starts_at and s.ends_at
       -- Freshness is now an outer bound, not a hair trigger. The 2-minute
       -- version excluded every unit that has ever existed here: production
       -- recorded 11 requests, 32 dispatch rounds and 0 candidates, because a
       -- crew whose background location task was napping vanished from the
       -- network entirely. Inside this window staleness is priced by the
       -- ranker (matching.ts) instead of being fatal.
       and loc.recorded_at > now() - make_interval(secs => unit_location_max_age_seconds())
       -- effective radius: a hospital-owned fleet may cap how far it travels
       and ST_DWithin(loc.location, req.pickup_point, least(p_radius_m, coalesce(h.ambulance_service_radius_m, p_radius_m)))
       -- effective care level is the lower of vehicle and crew
       and least(tier_rank(a.vehicle_tier), tier_rank(s.crew_tier))
             >= tier_rank(req.required_tier)
       and a.capabilities @> req.required_capabilities
       -- provider service area, when one is defined
       and (p.service_area is null or ST_Covers(p.service_area, req.pickup_point))
       -- a private fleet only serves its own hospital's requests once a destination is chosen
       and (h.id is null or h.ambulance_private_fleet is not true
            or req.destination_hospital_id is null or req.destination_hospital_id = p.hospital_id)
       -- a hospital fleet that isn't 24/7 only dispatches within its own operating hours
       and (h.id is null or h.ambulance_service_hours_247 or is_hospital_open_now(h.id))
       -- no active job
       and not exists (
         select 1 from transport_requests t
          where t.assigned_unit_id = a.id
            and t.status in ('matched','en_route_to_patient','on_scene',
                             'transporting','arrived_at_destination')
       )
       -- no live offer pending on this unit for a different request
       and not exists (
         select 1 from dispatch_offers o
          where o.ambulance_id = a.id
            and o.response = 'pending'
            and o.expires_at > now()
            and o.request_id <> p_request_id
       )
       -- no imminent scheduled job this one would run into
       and not exists (
         select 1 from transport_requests t
          where t.assigned_unit_id = a.id
            and t.status = 'scheduled'
            and t.scheduled_for between req.reference_time
                                    and req.reference_time + interval '2 hours'
       )
  )
  select live.unit_id, live.provider_id, live.provider_type, live.provider_hospital_id,
         live.reliability_score, live.vehicle_tier, live.crew_tier, live.capabilities,
         ST_Y(live.location::geometry), ST_X(live.location::geometry),
         ST_Distance(live.location, req.pickup_point),
         live.shift_ends_at,
         (select max(t.matched_at) from transport_requests t
           where t.assigned_unit_id = live.unit_id),
         live.location_age_seconds
    from live cross join req
   order by ST_Distance(live.location, req.pickup_point)
   limit p_limit;
$$;

revoke all on function find_candidate_units(uuid, integer, integer) from public, anon, authenticated;
grant execute on function find_candidate_units(uuid, integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 3. dispatch_supply_probe — why were there no candidates?
-- ---------------------------------------------------------------------------
--
-- dispatch_attempts already records reject_reasons, but only for units that
-- survived the SQL filters and reached the TypeScript ranker. When the SQL
-- returns nothing the tally is `{}` — which is exactly the case that has
-- occurred on every single round in production, so the table has recorded 32
-- attempts and explained none of them.
--
-- "No ambulance available" is one sentence covering several different
-- businesses problems: nobody signed up, nobody on shift, everyone busy,
-- everyone out of range, everyone's app asleep. Those need different responses,
-- and today they are indistinguishable.
--
-- This walks the funnel one filter at a time and reports how many units fall
-- out at each step, so the attempt record says *which* wall was hit.

create or replace function dispatch_supply_probe(
  p_request_id uuid,
  p_radius_m   integer default 15000
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with req as (
    select r.id, r.pickup_point, r.required_tier, r.required_capabilities,
           coalesce(r.scheduled_for, now()) as reference_time
      from transport_requests r where r.id = p_request_id
  )
  select jsonb_build_object(
    'units_total',        (select count(*) from ambulances),
    'units_active',       (select count(*) from ambulances a join ambulance_providers p on p.id = a.provider_id
                            where a.is_active and p.is_active),
    'units_free',         (select count(*) from ambulances a join ambulance_providers p on p.id = a.provider_id
                            where a.is_active and p.is_active and a.status = 'available'),
    'units_on_shift',     (select count(*) from ambulances a
                             join ambulance_providers p on p.id = a.provider_id
                             join ambulance_shifts s on s.ambulance_id = a.id
                             cross join req
                            where a.is_active and p.is_active and a.status = 'available'
                              and req.reference_time between s.starts_at and s.ends_at),
    'units_with_recent_fix', (select count(*) from ambulances a
                                join ambulance_providers p on p.id = a.provider_id
                                join ambulance_shifts s on s.ambulance_id = a.id
                                join ambulance_current_location loc on loc.ambulance_id = a.id
                                cross join req
                               where a.is_active and p.is_active and a.status = 'available'
                                 and req.reference_time between s.starts_at and s.ends_at
                                 and loc.recorded_at > now() - make_interval(secs => unit_location_max_age_seconds())),
    'units_in_radius',    (select count(*) from ambulances a
                             join ambulance_providers p on p.id = a.provider_id
                             join ambulance_shifts s on s.ambulance_id = a.id
                             join ambulance_current_location loc on loc.ambulance_id = a.id
                             cross join req
                            where a.is_active and p.is_active and a.status = 'available'
                              and req.reference_time between s.starts_at and s.ends_at
                              and loc.recorded_at > now() - make_interval(secs => unit_location_max_age_seconds())
                              and ST_DWithin(loc.location, req.pickup_point, p_radius_m)),
    'oldest_fix_seconds', (select min(extract(epoch from (now() - loc.recorded_at))::int)
                             from ambulance_current_location loc),
    'radius_m',           p_radius_m
  );
$$;

comment on function dispatch_supply_probe(uuid, integer) is
  'Funnel counts explaining why a dispatch round found no candidates: how many units exist, are active, are free, are on shift, have a usable fix, and are in radius. Recorded onto dispatch_attempts so "no ambulance available" resolves into which specific wall was hit.';

revoke all on function dispatch_supply_probe(uuid, integer) from public, anon, authenticated;
grant execute on function dispatch_supply_probe(uuid, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Job duration from real trips
-- ---------------------------------------------------------------------------
--
-- estimateJobDuration() in engine.ts returns a flat 45 or 60 minutes, and its
-- own comment says to replace it with a rolling median. It matters because it
-- feeds the shift-headroom filter: overestimate and units near end of shift are
-- excluded from work they could have done; underestimate and a crew is sent on
-- a job that runs past their shift.
--
-- Returns NULL when there is not enough history to be trustworthy, so the
-- caller keeps its constant rather than pretending three trips are a trend.
-- Production has zero completed transports today, so this will return NULL
-- until the service actually runs — which is the honest answer.

create or replace function median_job_duration_seconds(
  p_request_type text default 'emergency',
  p_min_samples  integer default 20
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  with done as (
    select extract(epoch from (completed_at - matched_at))::int as secs
      from transport_requests
     where status = 'completed'
       and request_type = p_request_type
       and matched_at is not null
       and completed_at is not null
       and completed_at > matched_at
       and completed_at > now() - interval '90 days'
       -- Guard against clock skew and rows fixed up by hand.
       and extract(epoch from (completed_at - matched_at)) between 300 and 21600
  )
  select case when (select count(*) from done) >= p_min_samples
              then (select percentile_cont(0.5) within group (order by secs)::int from done)
              else null
         end;
$$;

comment on function median_job_duration_seconds(text, integer) is
  'Median matched->completed duration over the last 90 days, or NULL when there are fewer than p_min_samples trips. Feeds the shift-headroom filter in place of a hardcoded guess.';

revoke all on function median_job_duration_seconds(text, integer) from public, anon;
grant execute on function median_job_duration_seconds(text, integer) to service_role;
