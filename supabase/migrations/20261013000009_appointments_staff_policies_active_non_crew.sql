-- Queue — hospital staff appointment policies: active staff only, never ambulance crew
--
-- 2026-10-13 audit H8. appointments_hospital_select / appointments_hospital_update
-- matched ANY hospital_admins row for the hospital:
--   * deactivated staff (is_active = false) kept reading — and updating — every
--     appointment at their former hospital through the API with their own JWT
--     (requireRole() filters is_active, RLS did not);
--   * hospital-fleet ambulance crew (role = 'ambulance_crew', 4 rows in prod) could
--     read and update every patient's appointments, diagnosis and notes included,
--     which has nothing to do with their job.
-- Both policies now require an active row whose role is not ambulance_crew. The
-- other roles (owner, admin, front_desk, specialist) are unchanged.

drop policy if exists "appointments_hospital_select" on appointments;
create policy "appointments_hospital_select" on appointments
  for select
  using (hospital_id in (
    select ha.hospital_id
      from hospital_admins ha
      join users u on u.id = ha.user_id
     where u.auth_id = auth.uid()
       and ha.is_active
       and ha.role <> 'ambulance_crew'
  ));

drop policy if exists "appointments_hospital_update" on appointments;
create policy "appointments_hospital_update" on appointments
  for update
  using (hospital_id in (
    select ha.hospital_id
      from hospital_admins ha
      join users u on u.id = ha.user_id
     where u.auth_id = auth.uid()
       and ha.is_active
       and ha.role <> 'ambulance_crew'
  ));
