-- pgTAP: a doctor can't hold two live direct bookings in the same slot.
-- Regression for 20261013000010_direct_booking_no_double_confirm.sql (audit M6).
-- Fixture rows are created and rolled back inside this transaction.

begin;
create extension if not exists pgtap with schema extensions;

select plan(3);

insert into auth.users (id, email) values
  ('66666666-6666-6666-6666-666666666661', 'slot-test-doctor@example.com'),
  ('66666666-6666-6666-6666-666666666662', 'slot-test-patient-a@example.com'),
  ('66666666-6666-6666-6666-666666666663', 'slot-test-patient-b@example.com')
on conflict (id) do nothing;

insert into public.users (id, auth_id, full_name, email) values
  ('abababab-0000-0000-0000-000000000001', '66666666-6666-6666-6666-666666666661', 'Slot Test Doctor',    'slot-test-doctor@example.com'),
  ('abababab-0000-0000-0000-000000000002', '66666666-6666-6666-6666-666666666662', 'Slot Test Patient A', 'slot-test-patient-a@example.com'),
  ('abababab-0000-0000-0000-000000000003', '66666666-6666-6666-6666-666666666663', 'Slot Test Patient B', 'slot-test-patient-b@example.com')
on conflict (id) do nothing;

-- Session-replication mode skips the booking triggers (doctor eligibility, plan
-- limits) that aren't what this test is about; the unique index still applies.
set local session_replication_role = replica;

insert into public.appointments (id, patient_id, doctor_user_id, appointment_date, start_time, type, reason, status, booking_mode, booking_ref) values
  ('acacacac-0000-0000-0000-000000000001', 'abababab-0000-0000-0000-000000000002', 'abababab-0000-0000-0000-000000000001',
   current_date + 3, '10:00', 'virtual', 'slot test', 'confirmed', 'direct', 'SLOTTEST-1'),
  ('acacacac-0000-0000-0000-000000000002', 'abababab-0000-0000-0000-000000000003', 'abababab-0000-0000-0000-000000000001',
   current_date + 3, '10:00', 'virtual', 'slot test', 'pending', 'direct', 'SLOTTEST-2');

select pass('a second patient may still request the slot while it is pending');

select throws_ok(
  $$update appointments set status = 'confirmed' where id = 'acacacac-0000-0000-0000-000000000002'$$,
  '23505', null, 'confirming a second booking in the same slot is rejected');

update appointments set status = 'cancelled' where id = 'acacacac-0000-0000-0000-000000000001';
select lives_ok(
  $$update appointments set status = 'confirmed' where id = 'acacacac-0000-0000-0000-000000000002'$$,
  'once the first booking is cancelled the slot can be confirmed');

select * from finish();
rollback;
