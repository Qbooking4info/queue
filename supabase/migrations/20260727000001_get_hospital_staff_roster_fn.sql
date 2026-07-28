-- StaffManagementScreen.tsx (mobile) was querying hospital_admins/clinic_admins
-- directly from the client. RLS on those tables only allows a caller to read
-- their OWN row ("Staff can read own clinic_admin row": user_id = caller;
-- hospital_admins is broader via fn_get_my_admin_hospital_ids() but still not
-- meant to be queried ad hoc from mobile) -- so any hospital_admin or
-- clinic_admin opening the staff roster got back an empty or self-only list,
-- silently, with no error. Same class of bug as get_my_staff_profile /
-- get_doctor_queue exist to prevent: give mobile a SECURITY DEFINER RPC that
-- does its own authorization check instead of relying on row-level policies
-- meant for other access patterns.
--
-- Caller must be an active hospital_admin or active clinic_admin at
-- p_hospital_id. Returns the same shape the screen already renders (staff
-- list + doctors list) so the screen only needs its data-fetching swapped,
-- not its render logic.

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
        'availability_status', COALESCE(d.availability_status, 'off_duty'),
        'email', u.email
      ) ORDER BY d.full_name), '[]'::jsonb)
      FROM doctors d
      LEFT JOIN specialties sp ON sp.id = d.specialty_id
      LEFT JOIN users u ON u.id = d.user_id
      WHERE d.hospital_id = p_hospital_id AND d.is_active = true
    )
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_hospital_staff_roster(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_hospital_staff_roster(uuid) TO authenticated;
