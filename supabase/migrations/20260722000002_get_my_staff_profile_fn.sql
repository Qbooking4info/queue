CREATE OR REPLACE FUNCTION get_my_staff_profile()
RETURNS TABLE(
  staff_role   text,
  hospital_id  uuid,
  clinic_id    uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  -- Hospital-level admin / front desk
  RETURN QUERY
  SELECT ha.role::text, ha.hospital_id, NULL::uuid
  FROM   hospital_admins ha
  WHERE  ha.user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  AND    ha.is_active = true
  LIMIT  1;

  IF FOUND THEN RETURN; END IF;

  -- Clinic-level admin / front desk / desk_officer
  RETURN QUERY
  SELECT ca.role::text, ca.hospital_id, ca.clinic_id
  FROM   clinic_admins ca
  WHERE  ca.user_id = (SELECT id FROM users WHERE auth_id = auth.uid())
  AND    ca.is_active = true
  LIMIT  1;
END;
$$;
