-- Two follow-ups to 2026-11-21, both found by checking the applied result
-- against real data rather than by reading the schema.

-- ---------------------------------------------------------------------------
-- 1. Arrival windows, for bookings that have no slot row
-- ---------------------------------------------------------------------------
--
-- 20261121000003 copies the window from the booked time_slots row. Applied and
-- correct -- and completely inert, because `time_slots` is EMPTY in production
-- (0 rows) and not one of the 102 appointments has a slot_id. The booking grid
-- is generated in the client (BookingFlowScreen's hourly OPD marks, the
-- referral screen's hourlySlotsForDate) and never writes a slot row, so the
-- trigger had nothing to read and every appointment kept a NULL window.
--
-- The window the patient was actually offered is the granularity of that grid:
-- an hour. So where there is no slot to copy from, derive it -- start_time plus
-- the configured window. That is not an invented promise; it is the same hour
-- the booking screen offered, written down.
--
-- A slot row, if one ever exists, still wins: a real booked window beats a
-- derived one.

INSERT INTO app_config (key, value)
VALUES ('booking_window_minutes', '60')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION set_appointment_end_time()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_minutes int;
BEGIN
  IF NEW.end_time IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.slot_id IS NOT NULL THEN
    SELECT ts.end_time INTO NEW.end_time
      FROM time_slots ts
     WHERE ts.id = NEW.slot_id;
  END IF;

  -- No slot, or a slot with no end of its own.
  IF NEW.end_time IS NULL AND NEW.start_time IS NOT NULL THEN
    SELECT COALESCE(NULLIF(value, '')::int, 60) INTO v_minutes
      FROM app_config WHERE key = 'booking_window_minutes';
    NEW.end_time := (NEW.start_time + make_interval(mins => COALESCE(v_minutes, 60)))::time;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_appointment_end_time ON appointments;
CREATE TRIGGER set_appointment_end_time
  BEFORE INSERT OR UPDATE OF slot_id ON appointments
  FOR EACH ROW EXECUTE FUNCTION set_appointment_end_time();

-- Existing bookings get the same treatment, so the 102 rows already in the
-- table show a window too rather than only new ones.
UPDATE appointments
   SET end_time = (start_time + make_interval(
         mins => COALESCE((SELECT NULLIF(value,'')::int FROM app_config WHERE key='booking_window_minutes'), 60)
       ))::time
 WHERE end_time IS NULL
   AND start_time IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Stamping the fee, server-side
-- ---------------------------------------------------------------------------
--
-- 20261121000008 added appointments.consultation_fee, to be written at
-- booking. A direct booking is inserted by the PATIENT's own client
-- (createDirectAppointment, RLS-scoped) -- so if the fee came from the request
-- body, the person paying it would be the one setting it.
--
-- A trigger instead. Same reasoning as fn_set_appointment_patient_id, which
-- already overrides a client-supplied patient_id for exactly this reason:
-- anything the client must not choose is resolved server-side from the row it
-- belongs to.
--
-- Hospital bookings are deliberately left NULL: an OPD visit is priced by the
-- hospital at the desk (opd_fee is a guide, not an agreement), and stamping a
-- number nobody quoted would be worse than leaving it empty.

CREATE OR REPLACE FUNCTION set_appointment_fee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fee numeric;
BEGIN
  -- Never trust a submitted value, and never revise a stamped one.
  IF TG_OP = 'UPDATE' THEN
    NEW.consultation_fee := OLD.consultation_fee;
    RETURN NEW;
  END IF;

  NEW.consultation_fee := NULL;

  -- Direct booking: the doctor is identified by their user id, and the fee
  -- they advertise lives on doctor_profiles.
  IF NEW.doctor_user_id IS NOT NULL THEN
    SELECT CASE WHEN NEW.type = 'home_visit' THEN dp.home_visit_fee ELSE dp.virtual_fee END
      INTO v_fee
      FROM doctor_profiles dp
     WHERE dp.user_id = NEW.doctor_user_id;
    NEW.consultation_fee := v_fee;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_appointment_fee ON appointments;
CREATE TRIGGER set_appointment_fee
  BEFORE INSERT OR UPDATE OF consultation_fee ON appointments
  FOR EACH ROW EXECUTE FUNCTION set_appointment_fee();

-- ---------------------------------------------------------------------------
-- 3. Clinical orders on a direct (hospital-less) booking
-- ---------------------------------------------------------------------------
--
-- 20261121000005's doctor policies key on `doctor_id IN current_doctor_ids()`.
-- That is right for a hospital booking and silently wrong for a direct one:
-- a direct appointment has `doctor_id = NULL` and identifies its doctor by
-- `doctor_user_id`, because `doctors.hospital_id` is NOT NULL and an
-- independent doctor has no `doctors` row to point at (20260817000001).
--
-- So an independent doctor could open the consultation plan and not be able to
-- prescribe anything -- the insert would fail the WITH CHECK with no useful
-- error. Same shape as the "Doctors can read own direct appointments" policy
-- that already exists on appointments for exactly this reason.

DROP POLICY IF EXISTS "Doctors manage prescriptions on own direct appointments" ON prescriptions;
CREATE POLICY "Doctors manage prescriptions on own direct appointments" ON prescriptions
  FOR ALL
  USING (
    appointment_id IN (
      SELECT a.id FROM appointments a
       WHERE a.doctor_user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    )
  )
  WITH CHECK (
    appointment_id IN (
      SELECT a.id FROM appointments a
       WHERE a.doctor_user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Doctors manage test orders on own direct appointments" ON test_orders;
CREATE POLICY "Doctors manage test orders on own direct appointments" ON test_orders
  FOR ALL
  USING (
    appointment_id IN (
      SELECT a.id FROM appointments a
       WHERE a.doctor_user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    )
  )
  WITH CHECK (
    appointment_id IN (
      SELECT a.id FROM appointments a
       WHERE a.doctor_user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    )
  );

-- Results on a direct booking follow the order, so the ordering-doctor read
-- policy needs the same alternative route in.
DROP POLICY IF EXISTS "Ordering doctor reads results on direct appointments" ON lab_results;
CREATE POLICY "Ordering doctor reads results on direct appointments" ON lab_results
  FOR SELECT USING (
    test_order_id IN (
      SELECT o.id FROM test_orders o
       JOIN appointments a ON a.id = o.appointment_id
       WHERE a.doctor_user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    )
  );

-- Verification (read-only; run after applying)
--   select count(*) filter (where end_time is null) as no_window,
--          count(*) as total from appointments;                 -- no_window 0
--   select start_time, end_time from appointments order by created_at desc limit 3;
--   -- then make a direct video booking and check consultation_fee matches the
--   -- doctor's virtual_fee at that moment:
--   select a.consultation_fee, dp.virtual_fee
--     from appointments a join doctor_profiles dp on dp.user_id = a.doctor_user_id
--    where a.booking_mode = 'direct' order by a.created_at desc limit 1;
--
--   select tablename, count(*) from pg_policies
--    where tablename in ('prescriptions','test_orders','lab_results')
--    group by tablename;            -- prescriptions 4, test_orders 4, lab_results 4
