-- pgTAP RLS regression suite (Task 9a).
--
-- Run locally with `supabase start` + `supabase test db`, or in CI. This
-- has NOT been run against the linked production project from this
-- environment (no local Docker available here) -- review before running
-- with `supabase test db --linked`, since it creates and rolls back
-- fixture rows against whichever database it targets.
--
-- Everything happens inside one transaction that is rolled back at the
-- end, so it leaves no residue against whatever database it's pointed at.

begin;
create extension if not exists pgtap with schema extensions;

select plan(9);

-- ── Fixtures ─────────────────────────────────────────────────────────────────
-- Two hospitals, two patients (one per hospital's appointment), one doctor
-- per hospital, and a medical history row per patient.

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'rls-test-patient-a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'rls-test-patient-b@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'rls-test-doctor-a@example.com')
on conflict (id) do nothing;

insert into public.users (id, auth_id, full_name, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'RLS Test Patient A', 'rls-test-patient-a@example.com'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'RLS Test Patient B', 'rls-test-patient-b@example.com')
on conflict (id) do nothing;

insert into public.hospitals (id, name, slug, address, city, state, is_active, is_verified) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'RLS Test Hospital A', 'rls-test-hospital-a', 'Test Address A', 'Lagos', 'Lagos', true, true),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'RLS Test Hospital B', 'rls-test-hospital-b', 'Test Address B', 'Lagos', 'Lagos', true, true)
on conflict (id) do nothing;

insert into public.doctors (id, hospital_id, auth_user_id, full_name, is_active) values
  ('cccccccc-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'Dr RLS Test A', true),
  ('cccccccc-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', null, 'Dr RLS Test B', true)
on conflict (id) do nothing;

insert into public.appointments (id, patient_id, hospital_id, doctor_id, appointment_date, start_time, type, status) values
  ('dddddddd-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', current_date, '10:00', 'in-person', 'confirmed'),
  ('dddddddd-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000002', current_date, '11:00', 'in-person', 'confirmed')
on conflict (id) do nothing;

insert into public.patient_medical_history (patient_id, conditions, allergies) values
  ('aaaaaaaa-0000-0000-0000-000000000001', array['test-condition-a'], array['test-allergy-a']),
  ('aaaaaaaa-0000-0000-0000-000000000002', array['test-condition-b'], array['test-allergy-b'])
on conflict (patient_id) do nothing;

-- ── Assume patient A's identity ───────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

select is(
  (select count(*)::int from public.patient_medical_history where patient_id = 'aaaaaaaa-0000-0000-0000-000000000002'),
  0,
  'Task 3: patient A cannot SELECT patient B''s patient_medical_history'
);

select is(
  (select count(*)::int from public.appointments where patient_id = 'aaaaaaaa-0000-0000-0000-000000000002'),
  0,
  'Core: patient A cannot SELECT patient B''s appointments'
);

-- RLS filters rows for UPDATE ... WHERE too -- it doesn't raise an error,
-- it just matches zero rows. Verify the row is unchanged once we drop back
-- to a role that bypasses RLS, rather than expecting an exception.
update public.users set full_name = 'hacked-by-patient-a' where id = 'aaaaaaaa-0000-0000-0000-000000000002';

select throws_ok(
  $$ select increment_slot_booking('00000000-0000-0000-0000-000000000000'::uuid) $$,
  '42501',
  null,
  'Task 6: authenticated patient cannot EXECUTE increment_slot_booking'
);

select throws_ok(
  $$ select * from get_doctor_queue('cccccccc-0000-0000-0000-000000000002'::uuid, current_date, current_date) $$,
  '42501',
  null,
  'Task 2: patient at Hospital A cannot EXECUTE get_doctor_queue for a Hospital B doctor'
);

-- ── Back to the test-runner role (bypasses RLS) to verify the UPDATE above
-- really did affect zero rows ──────────────────────────────────────────────
reset role;

select is(
  (select full_name from public.users where id = 'aaaaaaaa-0000-0000-0000-000000000002'),
  'RLS Test Patient B',
  'Core: patient A''s UPDATE on patient B''s users row affected zero rows'
);

-- ── Assume the anon role ──────────────────────────────────────────────────────
set local role anon;
select set_config('request.jwt.claims', '', true);

select throws_ok(
  $$ select * from get_doctor_queue('cccccccc-0000-0000-0000-000000000001'::uuid, current_date, current_date) $$,
  '42501',
  null,
  'Task 2: anon cannot EXECUTE get_doctor_queue at all'
);

select throws_ok(
  $$ select increment_slot_booking('00000000-0000-0000-0000-000000000000'::uuid) $$,
  '42501',
  null,
  'Task 6: anon cannot EXECUTE increment_slot_booking'
);

select is(
  (select count(*)::int from public.vitals_audit_log),
  0,
  'Task 3d: anon cannot SELECT vitals_audit_log (no matching policy for anon)'
);

-- ── Regression net: every table in public has RLS enabled ─────────────────────
reset role;

select is(
  (
    select count(*)::int
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
  ),
  0,
  'Regression net: every table in public has relrowsecurity = true'
);

select * from finish();
rollback;
