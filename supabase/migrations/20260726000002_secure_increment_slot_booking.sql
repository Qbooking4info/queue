-- Task 6: increment_slot_booking is SECURITY DEFINER and increments
-- booked_count on any slot id passed in, with no check that the caller has
-- an appointment for it. Slot ids are readable by anyone (time_slots SELECT
-- allows is_available = true). Production grants showed both anon AND
-- authenticated could execute it -- worse than assumed, since anon has no
-- session at all to reason about.
--
-- No client code calls this RPC (grep of web/ and mobile/ finds only the
-- generated database.ts type declaration, no .rpc('increment_slot_booking')
-- call site). The comment in 20260720000003_fix_slots_rls.sql confirms the
-- booking flow uses the service-role admin client and bypasses RLS, so this
-- RPC is not required by the current server-side flow.

REVOKE EXECUTE ON FUNCTION increment_slot_booking(uuid) FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION increment_slot_booking(uuid) TO service_role;
