-- Combined doctor status for hospital staff: "Active - On Duty" / "Active -
-- On Break" / "Active - Off Duty" / "Inactive". Two things collapse into
-- "Inactive" here, not one: a doctor deactivated at this hospital
-- (doctors.is_active = false), AND a doctor who's still active here but
-- currently "at" a DIFFERENT hospital in their multi-hospital setup
-- (users.active_hospital_id points elsewhere) -- from this hospital's point
-- of view those read the same way: not available to see a patient right now.
-- Only 'on_duty' (implying is_active and "here") may ever be assigned a
-- patient -- already enforced separately by enforce_doctor_assignable
-- (20260913000001); this migration is purely about giving staff an accurate
-- display, reusing the exact active-hospital-resolution rule already
-- implemented independently in four places (assign_doctor, auth-server.ts,
-- /api/me/role, AuthContext.tsx): users.active_hospital_id, falling back to
-- the doctor's earliest-created active hospital link when unset.
--
-- get_hospital_staff_roster previously excluded inactive doctors entirely
-- (`d.is_active = true`) -- staff had no way to see a doctor was deactivated
-- versus never having existed. Now returns every doctor at the hospital,
-- inactive ones included, each labelled correctly instead of vanishing.

CREATE OR REPLACE FUNCTION public.get_hospital_staff_roster(p_hospital_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_user_id FROM users WHERE auth_id = auth.uid();

  IF NOT EXISTS (
    SELECT 1 FROM hospital_admins ha
    WHERE ha.hospital_id = p_hospital_id AND ha.user_id = v_user_id
    UNION
    SELECT 1 FROM clinic_admins ca
    WHERE ca.hospital_id = p_hospital_id AND ca.user_id = v_user_id AND ca.is_active = true
  ) THEN
    RAISE EXCEPTION 'Not authorised to view this hospital''s staff'
      USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'staff', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', x.id, 'full_name', x.full_name, 'email', x.email,
        'role', x.role, 'clinic_name', x.clinic_name, 'avatar_url', x.avatar_url
      )), '[]'::jsonb)
      FROM (
        SELECT u.id, u.full_name, u.email, ha.role, NULL::text AS clinic_name, u.avatar_url
        FROM hospital_admins ha
        JOIN users u ON u.id = ha.user_id
        WHERE ha.hospital_id = p_hospital_id
        UNION ALL
        SELECT u.id, u.full_name, u.email, ca.role, hc.name AS clinic_name, u.avatar_url
        FROM clinic_admins ca
        JOIN users u ON u.id = ca.user_id
        LEFT JOIN hospital_clinics hc ON hc.id = ca.clinic_id
        WHERE ca.hospital_id = p_hospital_id AND ca.is_active = true
      ) x
    ),
    'doctors', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', d.id, 'full_name', d.full_name, 'title', d.title,
        'specialty_name', sp.name,
        'clinic_id', d.clinic_id,
        'is_active', d.is_active,
        'availability_status', COALESCE(d.availability_status, 'off_duty'),
        'display_status', CASE
          WHEN NOT d.is_active THEN 'inactive'
          WHEN d.hospital_id IS DISTINCT FROM COALESCE(
            u.active_hospital_id,
            (SELECT d2.hospital_id FROM doctors d2
               WHERE d2.user_id = d.user_id AND d2.is_active = true
               ORDER BY d2.created_at ASC LIMIT 1)
          ) THEN 'inactive'
          ELSE COALESCE(d.availability_status, 'off_duty')
        END,
        'email', u.email
      ) ORDER BY d.full_name), '[]'::jsonb)
      FROM doctors d
      LEFT JOIN specialties sp ON sp.id = d.specialty_id
      LEFT JOIN users u ON u.id = d.user_id
      WHERE d.hospital_id = p_hospital_id
    )
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_hospital_staff_roster(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_hospital_staff_roster(uuid) TO authenticated;
