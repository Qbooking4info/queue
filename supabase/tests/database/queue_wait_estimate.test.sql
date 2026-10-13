-- pgTAP: queue wait estimates (audit M9, 20261013400001). Medians, abandoned consults
-- ignored, historical wait is a floor rather than added to the queue term.
-- Fixture rows are created and rolled back.

begin;
create extension if not exists pgtap with schema extensions;

select plan(3);

set local session_replication_role = replica;  -- fixtures only; renumber is called directly

insert into public.hospitals (id, name, slug, address, city, state, is_active, is_verified) values
  ('cdcdcdcd-0000-0000-0000-000000000001', 'Wait Test Hospital', 'wait-test-hospital', 'x', 'Lagos', 'Lagos', true, true);
insert into public.doctors (id, hospital_id, full_name, is_active) values
  ('cececece-0000-0000-0000-000000000001', 'cdcdcdcd-0000-0000-0000-000000000001', 'Dr Wait Test', true);

-- History: consults of 10, 10, 10 min and one left open for 6 h; waits of 20 min x3.
insert into public.appointments (hospital_id, doctor_id, appointment_date, start_time, type, reason, status, booking_mode, booking_ref,
                                 checked_in_at, consult_started_at, consult_ended_at)
select 'cdcdcdcd-0000-0000-0000-000000000001', 'cececece-0000-0000-0000-000000000001', current_date - 1, '09:00', 'in-person', 'h', 'completed', 'walkin',
       'WAITHIST-' || g, now() - interval '1 day', now() - interval '1 day' + interval '20 minutes',
       now() - interval '1 day' + interval '20 minutes' + (case when g = 4 then interval '6 hours' else interval '10 minutes' end)
  from generate_series(1, 4) g;

-- Today's queue: three checked in.
insert into public.appointments (id, hospital_id, doctor_id, appointment_date, start_time, type, reason, status, booking_mode, booking_ref, check_in_date, checked_in_at)
select ('cfcfcfcf-0000-0000-0000-00000000000' || g)::uuid, 'cdcdcdcd-0000-0000-0000-000000000001', 'cececece-0000-0000-0000-000000000001',
       current_date, '10:00', 'in-person', 'q', 'checked_in', 'walkin', 'WAITQ-' || g, current_date, now() + (g || ' minutes')::interval
  from generate_series(1, 3) g;

select renumber_doctor_queue('cdcdcdcd-0000-0000-0000-000000000001', 'cececece-0000-0000-0000-000000000001', current_date);

select is((select estimated_wait from appointments where id = 'cfcfcfcf-0000-0000-0000-000000000001'), 20::int,
          'first in line: the historical wait (20 min), not zero');
select is((select estimated_wait from appointments where id = 'cfcfcfcf-0000-0000-0000-000000000002'), 20::int,
          'second: one 10-min consult ahead is under the 20-min floor, so 20 (old formula said 20 + 10 + skew)');
select is((select estimated_wait from appointments where id = 'cfcfcfcf-0000-0000-0000-000000000003'), 20::int,
          'third: two 10-min consults ahead = 20; the 6-hour abandoned consult is ignored');

select * from finish();
rollback;
