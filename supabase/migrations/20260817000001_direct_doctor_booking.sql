-- ── Direct-to-doctor booking + independent doctor settings ───────────────────
-- New capability: a patient can book a doctor DIRECTLY (virtual consult or home
-- visit), with no hospital involved at all. Previously every appointment was
-- hospital-scoped (`hospital_id` NOT NULL) and every doctor-carrying column
-- pointed at a `doctors` row, which is itself always hospital-scoped
-- (`doctors.hospital_id` NOT NULL, one row per hospital link -- see
-- 20260816000001_doctor_independent_accounts.sql). A doctor with ZERO hospital
-- links -- the core "works independently" case this feature exists for --
-- has no `doctors` row at all, so `appointments.doctor_id` can't represent
-- them. Hence a second, parallel doctor-reference column rather than
-- relaxing doctor_id's target.

-- 1. appointments: allow a hospital-less, doctor-user-addressed booking shape.
ALTER TABLE appointments ALTER COLUMN hospital_id DROP NOT NULL;
ALTER TABLE appointments ALTER COLUMN doctor_id DROP NOT NULL;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS doctor_user_id uuid REFERENCES users(id);
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS home_visit_address text;

-- Exactly one of the two doctor-reference shapes, never a mix: a hospital
-- booking always has hospital_id and never doctor_user_id (doctor_id is NOT
-- required here -- plenty of live bookings are hospital_id-set with doctor_id
-- still NULL, assigned later at check-in via PATCH /api/appointments/[id]'s
-- assign_doctor action; the original version of this constraint wrongly
-- required doctor_id NOT NULL too and failed against 10 real rows); a direct
-- booking always has doctor_user_id and never hospital_id/doctor_id. Keeps
-- every existing hospital_id/doctor_id-keyed query correctly blind to direct
-- bookings (they simply don't match `hospital_id = ...` / doctor_id joins)
-- without needing a NULL-check added to each one individually.
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_booking_shape_check;
ALTER TABLE appointments ADD CONSTRAINT appointments_booking_shape_check CHECK (
  (hospital_id IS NOT NULL AND doctor_user_id IS NULL)
  OR
  (hospital_id IS NULL AND doctor_id IS NULL AND doctor_user_id IS NOT NULL)
);

-- `type` already distinguishes 'in-person' / 'virtual'; a direct home-visit
-- booking needs a third value ('home_visit'). booking_mode is documented as
-- an intentionally unconstrained free-text convention (no CHECK exists on
-- it) -- `type` was never confirmed either way, so defensively drop a
-- same-named constraint if Postgres auto-generated one when `type` was
-- originally added (its default naming convention), which is a harmless
-- no-op if none exists.
ALTER TABLE appointments DROP CONSTRAINT IF EXISTS appointments_type_check;

-- 2. Fix the duplicate-active-booking guard for the new shape: it keys off
-- `hospital_id = NEW.hospital_id`, and in SQL `NULL = NULL` is never true, so
-- every direct booking currently sails through unchecked against every other
-- direct booking. Add a parallel dedupe path keyed on doctor_user_id instead.
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

  IF NEW.hospital_id IS NULL THEN
    -- Direct booking: dedupe per (patient/dependent, doctor_user_id) only --
    -- there's no clinic/hospital scoping concept for these at all.
    SELECT booking_ref INTO v_conflict_ref
    FROM appointments
    WHERE hospital_id IS NULL
      AND doctor_user_id = NEW.doctor_user_id
      AND status NOT IN ('completed', 'cancelled', 'no_show')
      AND COALESCE(urgency, 'routine') <> 'emergency'
      AND id IS DISTINCT FROM NEW.rescheduled_from
      AND CASE WHEN NEW.dependent_id IS NOT NULL
               THEN dependent_id = NEW.dependent_id
               ELSE patient_id = NEW.patient_id AND dependent_id IS NULL
          END
    LIMIT 1;

    IF v_conflict_ref IS NOT NULL THEN
      RAISE EXCEPTION
        'Already has an active direct booking (%) with this doctor. Cancel or complete it before booking again.',
        v_conflict_ref;
    END IF;

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

-- 3. Doctor-owned, hospital-agnostic settings for direct bookings. Deliberately
-- separate from the per-hospital `doctors` row (which stays hospital-scoped
-- and keeps its own consultation_fee/virtual_fee for hospital-mediated
-- visits) -- a doctor with 3 hospital links can have 3 different hospital
-- fees, but exactly one direct-booking fee for patients who come to them
-- independently.
-- Also doubles as the doctor's public professional profile for direct-booking
-- discovery (title/specialty/bio/years_experience) -- a fully independent
-- doctor with zero hospital links has no `doctors` row anywhere to source
-- these from, so patients searching/choosing a doctor to book directly need
-- them to live somewhere hospital-agnostic. full_name/avatar_url are already
-- on `users` and aren't duplicated here.
CREATE TABLE IF NOT EXISTS doctor_profiles (
  user_id                    uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  title                      text,
  specialty_id               uuid REFERENCES specialties(id),
  bio                        text,
  qualification              text,
  years_experience           integer,
  virtual_fee                integer,
  home_visit_fee             integer,
  accepts_direct_virtual     boolean NOT NULL DEFAULT false,
  accepts_direct_home_visit  boolean NOT NULL DEFAULT false,
  show_phone_to_patients     boolean NOT NULL DEFAULT false,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE doctor_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Doctors manage own direct-booking profile" ON doctor_profiles;
CREATE POLICY "Doctors manage own direct-booking profile" ON doctor_profiles
  FOR ALL
  USING (EXISTS (SELECT 1 FROM users u WHERE u.id = doctor_profiles.user_id AND u.auth_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM users u WHERE u.id = doctor_profiles.user_id AND u.auth_id = auth.uid()));

-- No anon/authenticated-patient SELECT policy here on purpose -- a patient
-- viewing a doctor's public profile reads through GET /api/public/doctors/[id]
-- (service-role, explicit safe-column projection), matching this app's
-- established pattern of funneling cross-account reads through an API route
-- rather than opening RLS to every authenticated user (see
-- web/src/lib/public-hospital-select.ts and the notify-staff fix).

-- 4. Uploaded qualification/credential documents -- a doctor's independent
-- identity has no existing home for these (qualification/mdcn_number today
-- live per-hospital-row on `doctors`, duplicated per link); this is one
-- canonical, hospital-agnostic set per doctor.
CREATE TABLE IF NOT EXISTS doctor_qualification_documents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        text NOT NULL,
  file_path    text NOT NULL, -- storage.objects path within the doctor-credentials bucket
  uploaded_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_doctor_qualification_documents_user ON doctor_qualification_documents(user_id);

ALTER TABLE doctor_qualification_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Doctors manage own qualification documents" ON doctor_qualification_documents;
CREATE POLICY "Doctors manage own qualification documents" ON doctor_qualification_documents
  FOR ALL
  USING (EXISTS (SELECT 1 FROM users u WHERE u.id = doctor_qualification_documents.user_id AND u.auth_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM users u WHERE u.id = doctor_qualification_documents.user_id AND u.auth_id = auth.uid()));

-- 5. Private storage bucket for the actual files. Not public -- patient-facing
-- reads go through a service-role-signed URL from the API (short expiry),
-- same reasoning as the RLS omission above. This is the first Storage bucket
-- in this project; there's no prior pattern to follow for the objects RLS,
-- so it's scoped as narrowly as INSERT/SELECT/DELETE on the doctor's own
-- `{user_id}/...` path prefix.
INSERT INTO storage.buckets (id, name, public)
VALUES ('doctor-credentials', 'doctor-credentials', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Doctors manage own credential files" ON storage.objects;
CREATE POLICY "Doctors manage own credential files" ON storage.objects
  FOR ALL
  USING (
    bucket_id = 'doctor-credentials'
    AND (storage.foldername(name))[1] = (SELECT id::text FROM users WHERE auth_id = auth.uid())
  )
  WITH CHECK (
    bucket_id = 'doctor-credentials'
    AND (storage.foldername(name))[1] = (SELECT id::text FROM users WHERE auth_id = auth.uid())
  );

-- 6. Let a doctor read their own direct (hospital-less) bookings client-side,
-- same as "Doctors can read own appointments" (20260804000001) already does
-- for hospital-scoped ones via doctor_id/assigned_doctor_id. That policy
-- can't just be widened in place (it's an OR of doctor_id/assigned_doctor_id
-- membership checks against `doctors` rows, which don't exist for a fully
-- independent doctor) -- add a second, additive policy instead. Mutations
-- (approve/reject/start/complete) still go through a service-role API route,
-- matching every other staff-side appointment mutation in this app -- this
-- is read-only.
DROP POLICY IF EXISTS "Doctors can read own direct appointments" ON appointments;
CREATE POLICY "Doctors can read own direct appointments" ON appointments
  FOR SELECT USING (
    doctor_user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  );

-- Patients can already INSERT/SELECT their own appointments regardless of
-- hospital_id ("Patients can create their own appointments" / "...view
-- their own appointments", 20260531115800 -- both keyed purely on
-- patient_id, no hospital_id involved) -- direct bookings need no new
-- patient-side policy at all.
