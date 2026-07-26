-- Task 10 (drop): separate migration from the prep step so the drop can be
-- reverted independently (re-adding the column) without touching the RLS
-- policy / function changes made in 20260726000005.
--
-- Confirmed before this migration: 0 rows in clinic_admins have a non-null
-- auth_user_id, user_id is now NOT NULL, and no application code,
-- RLS policy, or function references clinic_admins.auth_user_id anymore.

ALTER TABLE clinic_admins DROP COLUMN auth_user_id;
