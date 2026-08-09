-- ── Prevent duplicate active bookings per patient/dependent at the same
--    hospital (single-clinic) or same clinic (multi-clinic hospital) ─────────
--
-- Emergency bookings are exempt entirely: they neither trigger nor are
-- blocked by this check, since an emergency visit isn't a substitute for a
-- scheduled one and a patient in crisis shouldn't be turned away because
-- they already have a routine appointment booked.
--
-- Reschedules insert the new row before cancelling the old one (see
-- rescheduleAppointment in mobile/lib/api.ts), so the row being replaced is
-- excluded via rescheduled_from rather than requiring cancel-then-insert
-- ordering.

CREATE OR REPLACE FUNCTION check_duplicate_active_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_clinic_model text;
  v_conflict_ref text;
BEGIN
  IF COALESCE(NEW.urgency, 'routine') = 'emergency' THEN
    RETURN NEW;
  END IF;

  -- Unregistered walk-ins (no patient_id) have nothing to dedupe against.
  IF NEW.patient_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT clinic_model INTO v_clinic_model FROM hospitals WHERE id = NEW.hospital_id;

  SELECT booking_ref INTO v_conflict_ref
  FROM appointments
  WHERE hospital_id = NEW.hospital_id
    AND status NOT IN ('completed', 'cancelled', 'no_show')
    AND COALESCE(urgency, 'routine') <> 'emergency'
    AND id IS DISTINCT FROM NEW.rescheduled_from
    AND CASE WHEN NEW.dependent_id IS NOT NULL
             THEN dependent_id = NEW.dependent_id
             ELSE patient_id = NEW.patient_id AND dependent_id IS NULL
        END
    AND (v_clinic_model IS DISTINCT FROM 'multi' OR NEW.clinic_id IS NULL OR clinic_id = NEW.clinic_id)
  LIMIT 1;

  IF v_conflict_ref IS NOT NULL THEN
    RAISE EXCEPTION
      'Already has an active booking (%) at this %. Cancel or complete it before booking again.',
      v_conflict_ref,
      (CASE WHEN v_clinic_model = 'multi' AND NEW.clinic_id IS NOT NULL THEN 'clinic' ELSE 'hospital' END);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_no_duplicate_active_booking ON appointments;
CREATE TRIGGER enforce_no_duplicate_active_booking
  BEFORE INSERT ON appointments
  FOR EACH ROW EXECUTE FUNCTION check_duplicate_active_booking();
