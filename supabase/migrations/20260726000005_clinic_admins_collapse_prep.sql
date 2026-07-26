-- Task 10 (prep): clinic_admins has two identity columns, user_id and
-- auth_user_id. Confirmed live against production (2026-07-26): all 8
-- current rows have user_id set and auth_user_id always null -- zero rows
-- depend on auth_user_id, and requireRole()/getUserRole() already resolve
-- everyone via user_id as the primary/only working path in practice.
--
-- Two things reference clinic_admins.auth_user_id directly and must be
-- updated before the column can be dropped (next migration):
--
-- 1. vitals_audit_log's "Front desk can read clinic vitals" policy matches
--    on clinic_admins.auth_user_id = auth.uid(). Since that column is
--    always null in every row, this policy currently never matches ANY
--    row for ANY front desk staff -- it's dead code, and front desk
--    currently cannot read the vitals audit log for their clinic at all,
--    which defeats the point of the policy. Recreating it against user_id
--    both unblocks the column drop and fixes this latent bug.
--
-- 2. get_doctor_queue's caller check (added in
--    20260726000001_secure_get_doctor_queue.sql) matches on
--    `ca.user_id = v_user_id OR ca.auth_user_id = auth.uid()`. Drops the
--    auth_user_id half; user_id already covers every real row.

DROP POLICY IF EXISTS "Front desk can read clinic vitals" ON vitals_audit_log;

CREATE POLICY "Front desk can read clinic vitals"
  ON vitals_audit_log FOR SELECT
  USING (
    appointment_id IN (
      SELECT a.id FROM appointments a
      WHERE a.hospital_id IN (
        SELECT ca.hospital_id FROM clinic_admins ca
        JOIN users u ON u.id = ca.user_id
        WHERE u.auth_id = auth.uid() AND ca.is_active = true
      )
    )
  );

CREATE OR REPLACE FUNCTION get_doctor_queue(
  p_doctor_id   uuid,
  p_date        date,
  p_today       date
)
RETURNS TABLE (
  id               uuid,
  appointment_date date,
  start_time       text,
  type             text,
  status           text,
  reason           text,
  urgency          text,
  queue_position   integer,
  patient_id       uuid,
  patient_name     text,
  patient_phone    text,
  patient_gender   text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;

  SELECT u.id INTO v_user_id FROM users u WHERE u.auth_id = auth.uid();

  IF NOT EXISTS (
    SELECT 1 FROM doctors d
    WHERE d.id = p_doctor_id
      AND (
        d.auth_user_id = auth.uid()
        OR d.user_id = v_user_id
        OR d.hospital_id IN (
          SELECT ha.hospital_id FROM hospital_admins ha
          WHERE ha.user_id = v_user_id AND ha.is_active = true
          UNION
          SELECT ca.hospital_id FROM clinic_admins ca
          WHERE ca.user_id = v_user_id AND ca.is_active = true
        )
      )
  ) THEN
    RAISE EXCEPTION 'Not authorised to view this doctor queue'
      USING ERRCODE = '42501';
  END IF;

  IF p_date IS NOT NULL THEN
    RETURN QUERY
      SELECT * FROM (
        SELECT DISTINCT ON (a.id)
          a.id,
          a.appointment_date,
          a.start_time::text,
          a.type,
          a.status,
          a.reason,
          a.urgency,
          a.queue_position,
          a.patient_id,
          COALESCE(u.full_name, a.walkin_patient_name) AS patient_name,
          COALESCE(u.phone, a.walkin_patient_phone)     AS patient_phone,
          u.gender     AS patient_gender
        FROM appointments a
        LEFT JOIN users u ON u.id = a.patient_id
        WHERE (a.doctor_id = p_doctor_id OR a.assigned_doctor_id = p_doctor_id)
          AND (a.appointment_date = p_date OR a.check_in_date = p_date)
          AND a.status        <> 'cancelled'
        ORDER BY a.id
      ) sub
      ORDER BY sub.start_time;
  ELSE
    RETURN QUERY
      SELECT * FROM (
        SELECT DISTINCT ON (a.id)
          a.id,
          a.appointment_date,
          a.start_time::text,
          a.type,
          a.status,
          a.reason,
          a.urgency,
          a.queue_position,
          a.patient_id,
          COALESCE(u.full_name, a.walkin_patient_name) AS patient_name,
          COALESCE(u.phone, a.walkin_patient_phone)     AS patient_phone,
          u.gender     AS patient_gender
        FROM appointments a
        LEFT JOIN users u ON u.id = a.patient_id
        WHERE (a.doctor_id = p_doctor_id OR a.assigned_doctor_id = p_doctor_id)
          AND a.appointment_date > p_today
          AND a.status          <> 'cancelled'
        ORDER BY a.id
      ) sub
      ORDER BY sub.appointment_date, sub.start_time;
  END IF;
END;
$$;

-- Safe now: confirmed 0 rows have user_id null (checked live before writing
-- this migration).
ALTER TABLE clinic_admins ALTER COLUMN user_id SET NOT NULL;
