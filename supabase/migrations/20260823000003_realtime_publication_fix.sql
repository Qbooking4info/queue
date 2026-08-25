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

ALTER PUBLICATION supabase_realtime ADD TABLE appointments;
ALTER PUBLICATION supabase_realtime ADD TABLE virtual_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE transport_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE ambulance_current_location;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
