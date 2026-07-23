-- SECURITY DEFINER function so mobile anon client can read patient names
-- when fetching a doctor's queue (RLS on users table blocks the join otherwise)
CREATE OR REPLACE FUNCTION get_doctor_queue(
  p_doctor_id   uuid,
  p_date        date,      -- NULL = upcoming (> today)
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
BEGIN
  IF p_date IS NOT NULL THEN
    RETURN QUERY
      SELECT
        a.id,
        a.appointment_date,
        a.start_time::text,
        a.type,
        a.status,
        a.reason,
        a.urgency,
        a.queue_position,
        a.patient_id,
        u.full_name  AS patient_name,
        u.phone      AS patient_phone,
        u.gender     AS patient_gender
      FROM appointments a
      LEFT JOIN users u ON u.id = a.patient_id
      WHERE a.doctor_id     = p_doctor_id
        AND a.appointment_date = p_date
        AND a.status        <> 'cancelled'
      ORDER BY a.start_time;
  ELSE
    RETURN QUERY
      SELECT
        a.id,
        a.appointment_date,
        a.start_time::text,
        a.type,
        a.status,
        a.reason,
        a.urgency,
        a.queue_position,
        a.patient_id,
        u.full_name  AS patient_name,
        u.phone      AS patient_phone,
        u.gender     AS patient_gender
      FROM appointments a
      LEFT JOIN users u ON u.id = a.patient_id
      WHERE a.doctor_id        = p_doctor_id
        AND a.appointment_date > p_today
        AND a.status          <> 'cancelled'
      ORDER BY a.appointment_date, a.start_time;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION get_doctor_queue(uuid, date, date) TO anon, authenticated;
