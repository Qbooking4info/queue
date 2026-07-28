-- Three separate problems found on `reviews` while auditing column privacy:
--
-- 1. Three extra policies exist in production (reviews_public_read,
--    reviews_insert_patient, reviews_hospital_update) that were never added as
--    tracked migrations -- same "applied directly against prod" gap already
--    known for vitals_audit_log/patient_medical_history (see AUDIT-FINDINGS.md).
--    They duplicate the tracked policies below but with weaker checks:
--    reviews_insert_patient only checks patient_id ownership, not that the
--    appointment is completed or that doctor_id matches the appointment's
--    doctor (the tracked "Patients can create reviews" policy checks both).
--    reviews_hospital_update has no WITH CHECK at all, which reopens exactly
--    the hole item 2 below is about. Dropping all three: the tracked policies
--    already cover the same access with the tighter checks intact.
--
-- 2. The tracked "Hospital admins can reply to reviews" WITH CHECK
--    (20260601040000) reads `rating = rating`, `doctor_id = doctor_id`, etc.
--    RLS WITH CHECK only sees the NEW row on UPDATE -- there's no OLD to
--    compare against in that expression, so every one of those comparisons is
--    a tautology (NEW.rating always equals NEW.rating) and always passes.
--    The policy has allowed a hospital admin to edit rating/body/doctor_id/
--    patient_id/appointment_id since it was written. Fixed with a BEFORE
--    UPDATE trigger, which does have OLD available.
--
-- 3. `anon` has unrestricted table-level SELECT on reviews (Supabase's default
--    grant), and RLS only filters rows (is_visible = true), not columns --
--    same shape as the doctors/hospitals leak fixed in
--    20260726000004_column_privacy_doctors_hospitals_v2.sql. Any visible
--    review's patient_id and appointment_id (raw UUIDs) are readable via a
--    direct PostgREST call with just the anon key, which is a linkage risk
--    if any future IDOR lets someone resolve a UUID back to a patient or
--    appointment. No current app code reads reviews publicly (the PRD lists
--    patient review display as a planned, not-yet-built feature), so this is
--    pre-emptive, not a fix to working code.

DROP POLICY IF EXISTS "reviews_public_read"     ON reviews;
DROP POLICY IF EXISTS "reviews_insert_patient"  ON reviews;
DROP POLICY IF EXISTS "reviews_hospital_update" ON reviews;

CREATE OR REPLACE FUNCTION public.guard_review_immutable_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.hospital_id      IS DISTINCT FROM OLD.hospital_id
     OR NEW.doctor_id     IS DISTINCT FROM OLD.doctor_id
     OR NEW.patient_id    IS DISTINCT FROM OLD.patient_id
     OR NEW.appointment_id IS DISTINCT FROM OLD.appointment_id
     OR NEW.rating        IS DISTINCT FROM OLD.rating
     OR NEW.body           IS DISTINCT FROM OLD.body
  THEN
    RAISE EXCEPTION 'Only hospital_reply and replied_at may be updated on a review'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS reviews_guard_immutable_fields ON reviews;
CREATE TRIGGER reviews_guard_immutable_fields
  BEFORE UPDATE ON reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_review_immutable_fields();

-- The USING clause (which side determines admin access) is still correct;
-- only the WITH CHECK was a no-op. Recreate without the broken WITH CHECK
-- now that the trigger enforces immutability.
DROP POLICY IF EXISTS "Hospital admins can reply to reviews" ON reviews;
CREATE POLICY "Hospital admins can reply to reviews" ON reviews
  FOR UPDATE
  USING (
    hospital_id IN (
      SELECT hospital_id FROM hospital_admins
      WHERE user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    )
  );

REVOKE SELECT ON reviews FROM anon;
GRANT SELECT (
  id, doctor_id, hospital_id, rating, body, hospital_reply, replied_at,
  is_visible, created_at
) ON reviews TO anon;
