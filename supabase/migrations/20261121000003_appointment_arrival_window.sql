-- Appointments had a start and no end, so no screen could say "arrive between
-- 09:00 and 09:30".
--
-- The window was never missing from the system -- time_slots has carried
-- start_time and end_time since the beginning. It just never reached the
-- appointment, so every screen printed a single instant and the patient read
-- it as an appointment time rather than the opening of a window. That is the
-- difference between a waiting room that fills evenly and one where everyone
-- arrives at 09:00.
--
-- Denormalised onto the appointment rather than joined at read time, the same
-- way reason, urgency and the referring hospital's name already are: the slot
-- can be edited or deleted afterwards, and what the patient was told should
-- not change retroactively when a clinic rebuilds next week's grid.

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS end_time time;

COMMENT ON COLUMN appointments.end_time IS
  'The close of the arrival window this booking was given, copied from its time_slot at booking. NULL for a walk-in or any booking with no slot, which has no window to state -- screens fall back to showing start_time alone rather than inventing one.';

-- Fill it from the slot on the way in, for every booking path at once. The
-- alternative -- setting it in each of /api/appointments, /appointments/refer,
-- createDirectAppointment and the dashboard's own insert -- is four places to
-- forget, and the one that forgets is the one a patient reads.
CREATE OR REPLACE FUNCTION set_appointment_end_time()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.end_time IS NULL AND NEW.slot_id IS NOT NULL THEN
    SELECT ts.end_time INTO NEW.end_time
      FROM time_slots ts
     WHERE ts.id = NEW.slot_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_appointment_end_time ON appointments;
CREATE TRIGGER set_appointment_end_time
  BEFORE INSERT OR UPDATE OF slot_id ON appointments
  FOR EACH ROW EXECUTE FUNCTION set_appointment_end_time();

-- Existing bookings that still have their slot get their window back. Ones
-- whose slot is gone keep NULL: there is no honest value to write, and a
-- guessed half-hour would be indistinguishable from a real one.
UPDATE appointments a
   SET end_time = ts.end_time
  FROM time_slots ts
 WHERE a.slot_id = ts.id
   AND a.end_time IS NULL
   AND ts.end_time IS NOT NULL;

-- Verification (read-only; run after applying)
--   select count(*) filter (where end_time is not null) as with_window,
--          count(*) filter (where end_time is null and slot_id is not null) as slot_but_no_window,
--          count(*) as total
--     from appointments;
--   -- slot_but_no_window should be 0.
