-- Queue — ambulance services: crew lifetime stats for the crew profile screen
--
-- The crew profile needed three figures it had no source for: jobs completed,
-- average time from dispatch to arriving on scene, and length of service.
--
-- All three are real rather than per-unit approximations, because transport_events
-- records every status transition with the actor who drove it. That matters: several
-- crew share one ambulance, so counting a unit's completed requests would credit
-- every job to every crew member who ever rode in that rig. Attributing by
-- transport_events.actor_id counts what this person actually did.
--
-- Same shape as the other crew functions in 20260729000004: SECURITY DEFINER,
-- resolving auth.uid() server-side, because the crew app must never read
-- ambulance_crew or transport_requests directly (no self-read RLS policy — a direct
-- read returns zero rows silently rather than erroring).

create or replace function get_my_crew_stats()
returns table (
  jobs_completed    integer,
  avg_arrival_secs  integer,
  member_since      timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select c.id as crew_id, c.created_at
      from ambulance_crew c
     where c.user_id = (select id from users where auth_id = auth.uid())
       and c.is_active
     order by c.created_at
     limit 1
  ),
  my_user as (
    select id from users where auth_id = auth.uid()
  ),
  -- Jobs this crew member personally saw through to handover. arrived_at_destination
  -- is the last crew-owned step (completion belongs to the receiving facility), so
  -- it, not 'completed', is what marks a job this person finished.
  done as (
    select count(distinct e.request_id) as n
      from transport_events e
     where e.actor_id = (select id from my_user)
       and e.to_status = 'arrived_at_destination'
  ),
  -- Dispatch to on-scene, per request, for requests this crew member marked on_scene.
  -- Measured from matched_at (when the unit was actually assigned) rather than the
  -- request's created_at, which would fold in however long dispatch spent searching
  -- for a unit — not something the crew controls or should be judged on.
  arrivals as (
    select extract(epoch from (min(e.occurred_at) - r.matched_at)) as secs
      from transport_events e
      join transport_requests r on r.id = e.request_id
     where e.actor_id = (select id from my_user)
       and e.to_status = 'on_scene'
       and r.matched_at is not null
     group by e.request_id, r.matched_at
    having min(e.occurred_at) >= r.matched_at
  )
  select
    coalesce((select n from done), 0)::integer,
    (select round(avg(secs))::integer from arrivals),
    (select created_at from me);
$$;

comment on function get_my_crew_stats() is
  'Lifetime stats for the calling crew member: jobs personally taken to handover, '
  'average dispatch-to-scene seconds, and when they joined. avg_arrival_secs is '
  'NULL until they have at least one on_scene transition on a matched request.';

revoke all on function get_my_crew_stats() from public;
grant execute on function get_my_crew_stats() to authenticated;
