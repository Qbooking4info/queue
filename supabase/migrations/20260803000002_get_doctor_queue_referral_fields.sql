-- Surface referral info (who referred, from where, why) directly on the
-- doctor's queue RPC, not just on the individual appointment detail view --
-- same three columns added to `appointments` in 20260803000001_doctor_referrals.sql.
--
-- CREATE OR REPLACE can't add columns to an existing function's RETURNS TABLE --
-- Postgres treats that as a return-type change (42P13) and requires the old
-- function to be dropped first.

DROP FUNCTION IF EXISTS get_doctor_queue(uuid, date, date);

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
  patient_gender   text,
  referral_reason           text,
  referred_by_doctor_name   text,
  referring_hospital_name   text
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
          u.gender     AS patient_gender,
          a.referral_reason,
          CASE WHEN rd.id IS NOT NULL THEN trim(concat(rd.title, ' ', rd.full_name)) END AS referred_by_doctor_name,
          rh.name AS referring_hospital_name
        FROM appointments a
        LEFT JOIN users u ON u.id = a.patient_id
        LEFT JOIN doctors rd ON rd.id = a.referred_by_doctor_id
        LEFT JOIN hospitals rh ON rh.id = a.referring_hospital_id
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
          u.gender     AS patient_gender,
          a.referral_reason,
          CASE WHEN rd.id IS NOT NULL THEN trim(concat(rd.title, ' ', rd.full_name)) END AS referred_by_doctor_name,
          rh.name AS referring_hospital_name
        FROM appointments a
        LEFT JOIN users u ON u.id = a.patient_id
        LEFT JOIN doctors rd ON rd.id = a.referred_by_doctor_id
        LEFT JOIN hospitals rh ON rh.id = a.referring_hospital_id
        WHERE (a.doctor_id = p_doctor_id OR a.assigned_doctor_id = p_doctor_id)
          AND a.appointment_date > p_today
          AND a.status          <> 'cancelled'
        ORDER BY a.id
      ) sub
      ORDER BY sub.appointment_date, sub.start_time;
  END IF;
END;
$$;
