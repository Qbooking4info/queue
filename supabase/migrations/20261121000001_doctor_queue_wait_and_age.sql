-- The doctor's queue could not say how long anyone had been waiting.
--
-- get_doctor_queue is the only way the doctors app may read a hospital queue
-- (RLS on appointments returns nothing useful to a doctor reading the table
-- directly), and its RETURNS TABLE never carried checked_in_at -- so the one
-- screen whose whole job is deciding who to call next showed appointment
-- times and no arrival times. The front desk's own queue has always had this,
-- because it reads appointments directly.
--
-- Three columns added, all read-only additions to the shape:
--
--   checked_in_at  when they physically arrived. "Waited 41 min" comes from
--                  this, not from start_time, which is when they were booked.
--   requeued_at    set by return_to_queue() when a patient comes back from a
--                  lab test. While set it replaces checked_in_at as the FIFO
--                  key (20261031000001), so the wait the doctor is shown has
--                  to use the same value or the row will claim a longer wait
--                  than its position implies.
--   patient_dob    the queue row says "F. Balogun, 34" in the v4 design. Age
--                  is clinically load-bearing at a glance and the doctor is
--                  already authorised for this patient's chart.
--
-- DEPENDS ON 20261031000001, which adds appointments.requeued_at. Apply that
-- first (scripts/apply-pending-migrations.mjs runs them in order).
--
-- CREATE OR REPLACE cannot add columns to an existing RETURNS TABLE (42P13),
-- so the function is dropped and recreated -- the same dance every previous
-- change to it has done. Body is otherwise the live definition verbatim.

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
  patient_dob      date,
  checked_in_at    timestamptz,
  requeued_at      timestamptz,
  referral_reason           text,
  referred_by_doctor_name   text,
  referring_hospital_name   text,
  referring_clinic_name     text,
  hospital_id      uuid
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
          u.gender        AS patient_gender,
          u.date_of_birth AS patient_dob,
          a.checked_in_at,
          a.requeued_at,
          a.referral_reason,
          CASE WHEN rd.id IS NOT NULL THEN trim(concat(rd.title, ' ', rd.full_name)) END AS referred_by_doctor_name,
          rh.name AS referring_hospital_name,
          rc.name AS referring_clinic_name,
          a.hospital_id
        FROM appointments a
        LEFT JOIN users u ON u.id = a.patient_id
        LEFT JOIN doctors rd ON rd.id = a.referred_by_doctor_id
        LEFT JOIN hospitals rh ON rh.id = a.referring_hospital_id
        LEFT JOIN hospital_clinics rc ON rc.id = a.referring_clinic_id
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
          u.gender        AS patient_gender,
          u.date_of_birth AS patient_dob,
          a.checked_in_at,
          a.requeued_at,
          a.referral_reason,
          CASE WHEN rd.id IS NOT NULL THEN trim(concat(rd.title, ' ', rd.full_name)) END AS referred_by_doctor_name,
          rh.name AS referring_hospital_name,
          rc.name AS referring_clinic_name,
          a.hospital_id
        FROM appointments a
        LEFT JOIN users u ON u.id = a.patient_id
        LEFT JOIN doctors rd ON rd.id = a.referred_by_doctor_id
        LEFT JOIN hospitals rh ON rh.id = a.referring_hospital_id
        LEFT JOIN hospital_clinics rc ON rc.id = a.referring_clinic_id
        WHERE (a.doctor_id = p_doctor_id OR a.assigned_doctor_id = p_doctor_id)
          AND a.appointment_date > p_today
          AND a.status          <> 'cancelled'
        ORDER BY a.id
      ) sub
      ORDER BY sub.appointment_date, sub.start_time;
  END IF;
END;
$$;

-- Same grants the dropped function had: the doctors app and the hospital
-- dashboard both call this as the signed-in user.
REVOKE ALL ON FUNCTION get_doctor_queue(uuid, date, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION get_doctor_queue(uuid, date, date) TO authenticated;
