-- AUDIT-FINDINGS.md (2026-07-26) flagged get_daily_booking_count: it takes
-- p_hospital_id as a caller-supplied parameter with no ownership check and is
-- granted to anon, so anyone with the APK's anon key can enumerate exact
-- daily booking volume per hospital/clinic across every hospital on the
-- platform -- competitively sensitive, and unlike get_doctor_queue this one
-- can't just be gated behind a staff-membership check: mobile/lib/api.ts
-- calls it via the public (anon) client from BookingFlowScreen mid-booking,
-- before the patient is necessarily logged in, to show "this day is full,
-- pick another."
--
-- Every caller (both call sites in BookingFlowScreen.tsx) only ever compares
-- the returned count against hospital.daily_booking_limit, which is itself
-- already public (see the anon column grant on hospitals in
-- 20260726000004_column_privacy_doctors_hospitals_v2.sql). So the exact count
-- carries no product value the app needs -- only "is it full yet" does.
-- Moving that comparison inside the function and returning a boolean
-- preserves the anonymous booking-flow use case while eliminating the
-- exact-volume leak entirely (for anon and authenticated alike).

DROP FUNCTION IF EXISTS public.get_daily_booking_count(uuid, date, uuid);

CREATE FUNCTION public.get_daily_booking_count(p_hospital_id uuid, p_date date, p_clinic_id uuid DEFAULT NULL::uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT
    (SELECT daily_booking_limit FROM hospitals WHERE id = p_hospital_id) IS NOT NULL
    AND (
      SELECT COUNT(*)::int FROM appointments
      WHERE hospital_id = p_hospital_id
        AND appointment_date = p_date
        AND status != 'cancelled'
        AND (p_clinic_id IS NULL OR clinic_id = p_clinic_id)
    ) >= (SELECT daily_booking_limit FROM hospitals WHERE id = p_hospital_id);
$function$;

REVOKE ALL ON FUNCTION public.get_daily_booking_count(uuid, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_daily_booking_count(uuid, date, uuid) TO anon, authenticated;
