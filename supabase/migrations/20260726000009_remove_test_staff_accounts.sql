-- Remove leftover test/dummy clinic_admin accounts for Queue Hospital.
-- These were never given a real auth login (auth_id IS NULL) and use
-- obviously fake identities (e.g. footballer names, "Front 1", "Paediatrics").
-- Cascades to clinic_admins via ON DELETE CASCADE.
--
-- Not touched: the one remaining auth_id-less user is a real Queue Hospital
-- doctor/specialist using a system-generated placeholder email
-- (dr.onodu.ugu.dcd9@portal.queueapp.co) - intentionally kept.

BEGIN;

DELETE FROM users
WHERE auth_id IS NULL
  AND email IN (
    'messi@lionel.com',
    'ebere@eze.com',
    'Front1@gmail.com',
    'paed@trics.com',
    'hans3@jide.com',
    'peter@mane.com',
    'chevy@aveo.com'
  );

COMMIT;
