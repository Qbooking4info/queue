-- pgTAP: clients may only insert notifications addressed to themselves.
-- Regression for 20261013000008_notifications_insert_own_only.sql (audit H2).
-- Fixture rows are created and rolled back inside this transaction.

begin;
create extension if not exists pgtap with schema extensions;

select plan(3);

insert into auth.users (id, email) values
  ('44444444-4444-4444-4444-444444444441', 'notif-test-a@example.com'),
  ('44444444-4444-4444-4444-444444444442', 'notif-test-b@example.com')
on conflict (id) do nothing;

insert into public.users (id, auth_id, full_name, email) values
  ('dddddddd-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444441', 'Notif Test A', 'notif-test-a@example.com'),
  ('dddddddd-0000-0000-0000-000000000002', '44444444-4444-4444-4444-444444444442', 'Notif Test B', 'notif-test-b@example.com')
on conflict (id) do nothing;

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok(
  $$insert into notifications (user_id, type, title, body)
    values ('dddddddd-0000-0000-0000-000000000002', 'transport', 'forged', 'x')$$,
  '42501', null, 'anon cannot write a notification to anyone');

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444441","role":"authenticated"}';
select throws_ok(
  $$insert into notifications (user_id, type, title, body)
    values ('dddddddd-0000-0000-0000-000000000002', 'transport', 'forged', 'x')$$,
  '42501', null, 'a user cannot write to another user''s inbox');

select lives_ok(
  $$insert into notifications (user_id, type, title, body)
    values ('dddddddd-0000-0000-0000-000000000001', 'confirmed', 'self', 'x')$$,
  'a user can write to their own inbox');

select * from finish();
rollback;
