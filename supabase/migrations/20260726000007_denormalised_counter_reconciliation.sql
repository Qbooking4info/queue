-- Task 12: nightly reconciliation for denormalised counters.
--
-- hospitals.avg_rating/review_count and doctors.avg_rating/review_count are
-- already trigger-maintained (recalculate_hospital_rating/
-- recalculate_doctor_rating, both SECURITY DEFINER, recompute from `reviews`
-- from scratch on every insert/update/delete) -- these can only drift if a
-- direct edit bypasses the trigger, so this is a defensive backstop.
--
-- hospitals.total_bookings, on inspection, is NOT trigger-maintained at all
-- and no application code writes it either (grepped web/src and mobile --
-- every reference reads it, none set it). It isn't drifting, it's simply
-- never populated. Defining it here as the all-time count of appointments
-- ever created for that hospital (regardless of status) -- this is an
-- interpretation, not a spec the codebase states anywhere; flagged in
-- AUDIT-FINDINGS.md in case product intent differs (e.g. excluding
-- cancelled bookings).
--
-- Logs rows that were wrong before correcting them, per the audit's
-- instruction -- silent self-healing would hide the underlying bug (a
-- misfired trigger, a direct data edit) rather than surface it.

create extension if not exists pg_cron with schema extensions;

create table if not exists public.counter_reconciliation_log (
  id            uuid primary key default gen_random_uuid(),
  ran_at        timestamptz not null default now(),
  entity_type   text not null check (entity_type in ('hospital', 'doctor')),
  entity_id     uuid not null,
  column_name   text not null,
  old_value     text,
  new_value     text
);

alter table public.counter_reconciliation_log enable row level security;

create policy "Platform admins read reconciliation log"
  on public.counter_reconciliation_log for select
  using (
    exists (
      select 1 from platform_admins pa
      join users u on u.id = pa.user_id
      where u.auth_id = auth.uid() and pa.is_active = true
    )
  );

create or replace function public.recompute_denormalised_counters()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- ── hospitals: avg_rating, review_count ──────────────────────────────────
  insert into counter_reconciliation_log (entity_type, entity_id, column_name, old_value, new_value)
  select 'hospital', h.id, 'avg_rating', h.avg_rating::text, computed.avg_rating::text
  from hospitals h
  join (
    select hospital_id, coalesce(avg(rating)::numeric(3,2), 0) as avg_rating
    from reviews where is_visible = true group by hospital_id
  ) computed on computed.hospital_id = h.id
  where h.avg_rating is distinct from computed.avg_rating;

  insert into counter_reconciliation_log (entity_type, entity_id, column_name, old_value, new_value)
  select 'hospital', h.id, 'review_count', h.review_count::text, computed.review_count::text
  from hospitals h
  join (
    select hospital_id, count(*) as review_count
    from reviews where is_visible = true group by hospital_id
  ) computed on computed.hospital_id = h.id
  where h.review_count is distinct from computed.review_count;

  insert into counter_reconciliation_log (entity_type, entity_id, column_name, old_value, new_value)
  select 'hospital', h.id, 'total_bookings', h.total_bookings::text, computed.total_bookings::text
  from hospitals h
  join (
    select hospital_id, count(*) as total_bookings
    from appointments group by hospital_id
  ) computed on computed.hospital_id = h.id
  where h.total_bookings is distinct from computed.total_bookings;

  update hospitals h set
    avg_rating     = coalesce((select avg(r.rating)::numeric(3,2) from reviews r where r.hospital_id = h.id and r.is_visible = true), 0),
    review_count   = (select count(*) from reviews r where r.hospital_id = h.id and r.is_visible = true),
    total_bookings = (select count(*) from appointments a where a.hospital_id = h.id);

  -- ── doctors: avg_rating, review_count ─────────────────────────────────────
  insert into counter_reconciliation_log (entity_type, entity_id, column_name, old_value, new_value)
  select 'doctor', d.id, 'avg_rating', d.avg_rating::text, computed.avg_rating::text
  from doctors d
  join (
    select doctor_id, coalesce(avg(rating)::numeric(3,2), 0) as avg_rating
    from reviews where is_visible = true group by doctor_id
  ) computed on computed.doctor_id = d.id
  where d.avg_rating is distinct from computed.avg_rating;

  insert into counter_reconciliation_log (entity_type, entity_id, column_name, old_value, new_value)
  select 'doctor', d.id, 'review_count', d.review_count::text, computed.review_count::text
  from doctors d
  join (
    select doctor_id, count(*) as review_count
    from reviews where is_visible = true group by doctor_id
  ) computed on computed.doctor_id = d.id
  where d.review_count is distinct from computed.review_count;

  update doctors d set
    avg_rating   = coalesce((select avg(r.rating)::numeric(3,2) from reviews r where r.doctor_id = d.id and r.is_visible = true), 0),
    review_count = (select count(*) from reviews r where r.doctor_id = d.id and r.is_visible = true);
end;
$$;

revoke all on function public.recompute_denormalised_counters() from public, anon, authenticated;

select cron.schedule(
  'recompute-denormalised-counters',
  '0 2 * * *', -- 02:00 UTC nightly
  $$select public.recompute_denormalised_counters();$$
);
