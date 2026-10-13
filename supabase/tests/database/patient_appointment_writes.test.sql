-- pgTAP: what a patient can and can't do to their own appointments.
-- Regression for 20261013100002 (guard triggers) + 20261013200001 (cancel policy,
-- past dates) — audit C4 / H1. Fixture rows are created and rolled back.

begin;
create extension if not exists pgtap with schema extensions;

select plan(6);

insert into auth.users (id, email) values
  ('77777777-7777-7777-7777-777777777771', 'pw-test-patient@example.com')
on conflict (id) do nothing;
insert into public.users (id, auth_id, full_name, email) values
  ('bcbcbcbc-0000-0000-0000-000000000001', '77777777-7777-7777-7777-777777777771', 'PW Test Patient', 'pw-test-patient@example.com')
on conflict (id) do nothing;
insert into public.hospitals (id, name, slug, address, city, state, is_active, is_verified, approval_mode) values
  ('bdbdbdbd-0000-0000-0000-000000000001', 'PW Test Hospital', 'pw-test-hospital', 'Test Address', 'Lagos', 'Lagos', true, true, 'manual')
on conflict (id) do nothing;

set local role authenticated;
set local request.jwt.claims = '{"sub":"77777777-7777-7777-7777-777777777771","role":"authenticated"}';

select throws_ok(
  $$insert into appointments (patient_id, hospital_id, appointment_date, start_time, type, reason, status, booking_mode, booking_ref)
    values ('bcbcbcbc-0000-0000-0000-000000000001', 'bdbdbdbd-0000-0000-0000-000000000001', current_date - 7, '09:00', 'in-person', 'x', 'pending', 'hospital', 'PWTEST-PAST')$$,
  '22023', null, 'a patient cannot book in the past');

insert into appointments (id, patient_id, hospital_id, appointment_date, start_time, type, reason, status, approval_status, booking_mode, booking_ref, diagnosis, queue_rank_override)
values ('bebebebe-0000-0000-0000-000000000001', 'bcbcbcbc-0000-0000-0000-000000000001', 'bdbdbdbd-0000-0000-0000-000000000001',
        current_date + 10, '09:00', 'in-person', 'x', 'confirmed', 'approved', 'hospital', 'PWTEST-1', 'self diagnosis', -100);

select is((select approval_status || '/' || status from appointments where id = 'bebebebe-0000-0000-0000-000000000001'),
          'pending_approval/pending', 'a patient cannot self-approve at a manual-approval hospital');

select ok((select diagnosis is null and queue_rank_override is null from appointments where id = 'bebebebe-0000-0000-0000-000000000001'),
          'clinical and queue fields written by a patient are discarded');

select throws_ok(
  $$update appointments set doctor_notes = 'x' where id = 'bebebebe-0000-0000-0000-000000000001'$$,
  '42501', null, 'a patient cannot write doctor_notes');

select lives_ok(
  $$update appointments set status = 'cancelled', cancellation_reason = 'test', refund_pct = 100
     where id = 'bebebebe-0000-0000-0000-000000000001'$$,
  'a patient can cancel their own pending appointment');

select is((select status || '/' || refund_pct from appointments where id = 'bebebebe-0000-0000-0000-000000000001'),
          'cancelled/100', 'the cancel lands and the refund is computed server-side');

select * from finish();
rollback;
