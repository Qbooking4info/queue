-- Discovered while verifying the new ring-overlay's realtime subscription:
-- the supabase_realtime publication -- what Postgres logical replication
-- actually uses to emit change events for Supabase Realtime's postgres_changes
-- feature -- contained only `transport_patient_location`. Every other
-- `.channel(...).on('postgres_changes', ...)` subscription in this codebase
-- (8 different screens watching `appointments` alone: both doctor queue
-- screens, front desk, staff appointments, and three web dashboard pages;
-- plus `virtual_sessions`, `transport_requests`, `ambulance_current_location`)
-- has been silently inert since it was written -- no error, the subscription
-- just never fires, because Postgres was never publishing changes on these
-- tables at all. This is independent of and upstream of RLS.
--
-- Confirmed via direct query against the live publication before writing
-- this migration, not guessed.

-- Idempotent: ALTER PUBLICATION ... ADD TABLE has no IF NOT EXISTS and errors
-- if the table is already a member, which blocked every later migration when
-- this was re-run on 2026-08-28 (some of these had been added out of band).
do $$
declare
  t text;
begin
  foreach t in array array[
    'appointments',
    'virtual_sessions',
    'transport_requests',
    'ambulance_current_location',
    'notifications'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
