-- Pilot data cleanup: keep only Queue Hospital and its staff
-- Queue Hospital ID: 4d822fe3-1ec5-4d10-a48c-997dd0d02dd6

BEGIN;

-- 1. Clear all transactional / patient data
DELETE FROM notifications;
DELETE FROM support_tickets;
DELETE FROM reviews;

-- 2. Delete appointments (cascades to vitals, audit logs, etc.)
DELETE FROM appointments;

-- 3. Reset time slot booking counts
UPDATE time_slots SET booked_count = 0 WHERE booked_count > 0;

-- 4. Delete dependents
DELETE FROM dependents;

-- 5. Delete medical histories
DELETE FROM patient_medical_history;

-- 6. Delete all hospitals except Queue Hospital
--    Cascade will remove their doctors, hospital_admins, clinics, slots, services, etc.
DELETE FROM hospitals
WHERE id <> '4d822fe3-1ec5-4d10-a48c-997dd0d02dd6';

-- 7. Collect user_ids to KEEP:
--    - Queue Hospital admins
--    - Queue Hospital doctors (with linked user accounts)
--    - Queue Hospital clinic admins
--    - Platform admins (admin@queue.health, qbooking4info@gmail.com)
--    All others are patients or staff from deleted hospitals → remove

DELETE FROM users
WHERE id NOT IN (
  -- Queue Hospital admins
  SELECT user_id FROM hospital_admins
  WHERE hospital_id = '4d822fe3-1ec5-4d10-a48c-997dd0d02dd6'
    AND user_id IS NOT NULL

  UNION

  -- Queue Hospital doctors with linked accounts
  SELECT user_id FROM doctors
  WHERE hospital_id = '4d822fe3-1ec5-4d10-a48c-997dd0d02dd6'
    AND user_id IS NOT NULL

  UNION

  -- Queue Hospital clinic admins
  SELECT ca.user_id FROM clinic_admins ca
  JOIN hospital_clinics hc ON hc.id = ca.clinic_id
  WHERE hc.hospital_id = '4d822fe3-1ec5-4d10-a48c-997dd0d02dd6'
    AND ca.user_id IS NOT NULL

  UNION

  -- Platform / super admins by known email
  SELECT id FROM users
  WHERE email IN (
    'admin@queue.health',
    'qbooking4info@gmail.com',
    'emmanuelokpanachi1@gmail.com',
    'excelokpanach@gmail.com',
    'waxyversatile7@gmail.com',
    'kheengdavid007@gmail.com'
  )
);

COMMIT;
