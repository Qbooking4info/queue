-- ── BH10: Fix time_slots patient UPDATE policy ────────────────────────────────
-- The existing "Patients can update own booked slot count" policy has
-- WITH CHECK (true), which allows a patient to set booked_count to any arbitrary
-- value (including negative or beyond max_capacity).
--
-- Fix:
--   1. Drop the permissive UPDATE policy.
--   2. Provide a SECURITY DEFINER RPC function `increment_slot_booking(slot_id)`
--      that atomically increments booked_count by exactly 1 only when there is
--      remaining capacity and the slot is available.
--
-- Application note: The booking flow in web/src/app/api/appointments/ uses the
-- service-role admin client, which bypasses RLS entirely — so the RPC is not
-- required for the current server-side flow. It is provided to prevent direct
-- client-side exploitation of the old policy and for any future patient-facing
-- client flows that need to increment the counter.

-- 1. Remove the permissive patient UPDATE policy
DROP POLICY IF EXISTS "Patients can update own booked slot count" ON time_slots;

-- 2. SECURITY DEFINER function: safe atomic increment
--    Returns the slot id on success, NULL if the slot is full or unavailable.
CREATE OR REPLACE FUNCTION increment_slot_booking(slot_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_id uuid;
BEGIN
  UPDATE time_slots
     SET booked_count = booked_count + 1
   WHERE id           = slot_id
     AND is_available = true
     AND booked_count < max_capacity
  RETURNING id INTO updated_id;

  RETURN updated_id; -- NULL if no row matched (full or unavailable)
END;
$$;

-- Grant execute to authenticated users so patient-facing clients can call it
GRANT EXECUTE ON FUNCTION increment_slot_booking(uuid) TO authenticated;
