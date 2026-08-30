-- ── Per-clinic age range / gender booking restrictions ─────────────────────
--
-- Lets a hospital admin or clinic sub-admin restrict who can book a given
-- clinic on medical-appropriateness grounds -- e.g. a Paediatrics clinic
-- capped at max_age 18, a Gynaecology/Antenatal clinic restricted to
-- gender_restriction 'female'. All three columns null (the default) means
-- "all ages, all genders" -- same null-means-unrestricted convention already
-- used by daily_booking_limit.
--
-- gender_restriction is constrained tightly (unlike users.gender, which is
-- free text) because it's admin-picked from a fixed dropdown, not user-typed.

ALTER TABLE hospital_clinics
  ADD COLUMN min_age integer,
  ADD COLUMN max_age integer,
  ADD COLUMN gender_restriction text;

ALTER TABLE hospital_clinics
  ADD CONSTRAINT hospital_clinics_min_age_check CHECK (min_age IS NULL OR min_age >= 0),
  ADD CONSTRAINT hospital_clinics_max_age_check CHECK (max_age IS NULL OR max_age >= 0),
  ADD CONSTRAINT hospital_clinics_age_range_check CHECK (min_age IS NULL OR max_age IS NULL OR min_age <= max_age),
  ADD CONSTRAINT hospital_clinics_gender_restriction_check CHECK (gender_restriction IS NULL OR gender_restriction IN ('male', 'female'));

-- Enforced the same way every other booking-limit invariant in this schema is
-- (check_duplicate_active_booking, check_plan_booking_limit): a BEFORE INSERT
-- trigger on appointments, SECURITY DEFINER -- most booking paths
-- (createAppointment/createHospitalAppointment/rescheduleAppointment in
-- mobile/lib/api.ts) are raw client-side Supabase inserts with no server in
-- the loop, so only RLS/triggers can actually guarantee this holds. Mobile's
-- BookingFlowScreen also pre-checks this client-side for a nicer UX, but this
-- trigger is what actually enforces it everywhere, including the two
-- server-mediated routes (walkin, refer) and any direct/malformed insert.
--
-- Same emergency exemption and patient-identity resolution (dependent_id vs
-- patient_id) as check_duplicate_active_booking, for consistency.
CREATE OR REPLACE FUNCTION check_clinic_booking_eligibility()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_min_age    integer;
  v_max_age    integer;
  v_gender_res text;
  v_dob        date;
  v_gender     text;
  v_age        integer;
BEGIN
  IF COALESCE(NEW.urgency, 'routine') = 'emergency' THEN
    RETURN NEW;
  END IF;

  IF NEW.clinic_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT min_age, max_age, gender_restriction
    INTO v_min_age, v_max_age, v_gender_res
    FROM hospital_clinics WHERE id = NEW.clinic_id;

  IF v_min_age IS NULL AND v_max_age IS NULL AND v_gender_res IS NULL THEN
    RETURN NEW;
  END IF;

  -- Unregistered walk-ins (no patient_id/dependent_id) have no demographic
  -- data to check against -- same early-out as check_duplicate_active_booking.
  IF NEW.dependent_id IS NOT NULL THEN
    SELECT date_of_birth, gender INTO v_dob, v_gender FROM dependents WHERE id = NEW.dependent_id;
  ELSIF NEW.patient_id IS NOT NULL THEN
    SELECT date_of_birth, gender INTO v_dob, v_gender FROM users WHERE id = NEW.patient_id;
  ELSE
    RETURN NEW;
  END IF;

  IF v_min_age IS NOT NULL OR v_max_age IS NOT NULL THEN
    IF v_dob IS NULL THEN
      RAISE EXCEPTION 'This clinic has an age restriction. Please complete the patient''s date of birth before booking here.';
    END IF;

    v_age := date_part('year', age(current_date, v_dob));

    IF v_min_age IS NOT NULL AND v_age < v_min_age THEN
      RAISE EXCEPTION 'This clinic only accepts patients aged % and above.', v_min_age;
    END IF;
    IF v_max_age IS NOT NULL AND v_age > v_max_age THEN
      RAISE EXCEPTION 'This clinic only accepts patients aged % and under.', v_max_age;
    END IF;
  END IF;

  IF v_gender_res IS NOT NULL THEN
    IF v_gender IS NULL THEN
      RAISE EXCEPTION 'This clinic has a gender restriction. Please complete the patient''s gender before booking here.';
    ELSIF lower(v_gender) <> v_gender_res THEN
      RAISE EXCEPTION 'This clinic is restricted to % patients.', v_gender_res;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_clinic_booking_eligibility ON appointments;
CREATE TRIGGER enforce_clinic_booking_eligibility
  BEFORE INSERT ON appointments
  FOR EACH ROW EXECUTE FUNCTION check_clinic_booking_eligibility();
