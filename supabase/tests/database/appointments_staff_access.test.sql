-- pgTAP: hospital staff appointment access is limited to active, non-crew staff.
-- Regression for 20261013000009_appointments_staff_policies_active_non_crew.sql
-- (audit H8). Fixture rows are created and rolled back inside this transaction.

begin;
create extension if not exists pgtap with schema extensions;

select plan(4);

insert into auth.users (id, email) values
  ('55555555-5555-5555-5555-555555555551', 'staff-test-desk@example.com'),
  ('55555555-5555-5555-5555-555555555552', 'staff-test-crew@example.com'),
  ('55555555-5555-5555-5555-555555555553', 'staff-test-gone@example.com'),
  ('55555555-5555-5555-5555-555555555554', 'staff-test-patient@example.com')
on conflict (id) do nothing;

insert into public.users (id, auth_id, full_name, email) values
  ('eeeeeeee-0000-0000-0000-000000000001', '55555555-5555-5555-5555-555555555551', 'Staff Test Desk',    'staff-test-desk@example.com'),
  ('eeeeeeee-0000-0000-0000-000000000002', '55555555-5555-5555-5555-555555555552', 'Staff Test Crew',    'staff-test-crew@example.com'),
  ('eeeeeeee-0000-0000-0000-000000000003', '55555555-5555-5555-5555-555555555553', 'Staff Test Gone',    'staff-test-gone@example.com'),
  ('eeeeeeee-0000-0000-0000-000000000004', '55555555-5555-5555-5555-555555555554', 'Staff Test Patient', 'staff-test-patient@example.com')
on conflict (id) do nothing;

insert into public.hospitals (id, name, slug, address, city, state, is_active, is_verified) values
  ('ffffffff-0000-0000-0000-000000000001', 'Staff Test Hospital', 'staff-test-hospital', 'Test Address', 'Lagos', 'Lagos', true, true)
on conflict (id) do nothing;

insert into public.hospital_admins (user_id, hospital_id, role, is_active) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'ffffffff-0000-0000-0000-000000000001', 'front_desk',     true),
  ('eeeeeeee-0000-0000-0000-000000000002', 'ffffffff-0000-0000-0000-000000000001', 'ambulance_crew', true),
  ('eeeeeeee-0000-0000-0000-000000000003', 'ffffffff-0000-0000-0000-000000000001', 'front_desk',     false);

insert into public.appointments (id, patient_id, hospital_id, appointment_date, start_time, type, reason, status, booking_mode, booking_ref)
values ('99999999-0000-0000-0000-000000000001', 'eeeeeeee-0000-0000-0000-000000000004', 'ffffffff-0000-0000-0000-000000000001',
        current_date + 1, '09:00', 'in-person', 'staff access test', 'pending', 'hospital', 'STAFFTEST-1');

set local role authenticated;

set local request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555551","role":"authenticated"}';
select is((select count(*)::int from appointments where hospital_id = 'ffffffff-0000-0000-0000-000000000001'), 1,
          'active front desk sees their hospital''s appointments');

set local request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555552","role":"authenticated"}';
select is((select count(*)::int from appointments where hospital_id = 'ffffffff-0000-0000-0000-000000000001'), 0,
          'hospital-fleet ambulance crew sees no appointments');

set local request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555553","role":"authenticated"}';
select is((select count(*)::int from appointments where hospital_id = 'ffffffff-0000-0000-0000-000000000001'), 0,
          'deactivated staff see no appointments');

update appointments set reason = 'tampered' where id = '99999999-0000-0000-0000-000000000001';
reset role;
select is((select reason from appointments where id = '99999999-0000-0000-0000-000000000001'), 'staff access test',
          'deactivated staff cannot update appointments');

select * from finish();
rollback;
