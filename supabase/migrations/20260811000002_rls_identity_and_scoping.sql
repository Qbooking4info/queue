-- Queue — close two RLS gaps found in the 2026-08-11 audit
--
--  3-B: doctors linked only through `user_id` match no appointment policy.
--  3-A: `doctors` and `hospitals` are readable by policy and restricted only by
--       column grants — one layer where the PRD assumes two.

-- ─── 3-B · the second doctor identity path ───────────────────────────────────
--
-- This schema links a doctor to their login two ways, and both are live:
--
--   doctors.auth_user_id -> auth.users.id   (self-registered)
--   doctors.user_id      -> users.id        (created from the hospital portal)
--
-- web/src/lib/supabase/auth-server.ts handles both. The RLS policies did not —
-- they resolved through auth_user_id alone. Of 16 doctors, 1 is linked only via
-- user_id: every direct Supabase query they make against `appointments` returns
-- zero rows, with no error. That reads in the UI as "no patients today" rather
-- than "your account is misconfigured", which is the worst version of this bug.
--
-- A helper keeps the two paths in one place; policies that need "the doctors
-- this caller is" now call it instead of restating half the rule.

create or replace function current_doctor_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select d.id
    from doctors d
   where d.auth_user_id = auth.uid()
      or d.user_id = (select u.id from users u where u.auth_id = auth.uid())
$$;

comment on function current_doctor_ids() is
  'Doctor rows belonging to the current session, resolved through BOTH identity paths (auth_user_id for self-registered, user_id for portal-created). Use this in policies rather than matching auth_user_id alone — see audit finding 3-B.';

grant execute on function current_doctor_ids() to authenticated;

drop policy if exists "Doctors can read own appointments" on appointments;
create policy "Doctors can read own appointments" on appointments
  for select using (
    doctor_id in (select current_doctor_ids())
    or assigned_doctor_id in (select current_doctor_ids())
  );

drop policy if exists "Doctors can read appointment vitals" on vitals_audit_log;
create policy "Doctors can read appointment vitals" on vitals_audit_log
  for select using (
    appointment_id in (
      select id from appointments
       where doctor_id in (select current_doctor_ids())
          or assigned_doctor_id in (select current_doctor_ids())
    )
  );

-- ─── 3-A · scope the public directory policies ───────────────────────────────
--
-- `20260531150000_public_tables_rls.sql` granted `FOR SELECT USING (true)` on
-- doctors and hospitals. `20260719000002_rls_fixes.sql` later narrowed both to
-- active/verified rows, so the live policy is already the tighter one — but the
-- column-level grants added by `20260726000004_column_privacy_doctors_hospitals_v2`
-- are still what keeps `doctors.email`, `doctors.mdcn_number` and the Paystack
-- payout columns out of anon's reach. Verified live: those columns are denied.
--
-- Restated here rather than left implicit, because the current protection
-- depends on migration ordering that is not obvious at either site, and a
-- future GRANT or a restore that replays grants differently would remove it
-- silently. Idempotent: this is the same rule 20260719000002 established.

drop policy if exists "Public can read active hospitals" on hospitals;
drop policy if exists "Public can read verified active hospitals" on hospitals;
create policy "Public can read verified active hospitals" on hospitals
  for select using (is_active = true and is_verified = true);

drop policy if exists "Public can read active doctors" on doctors;
create policy "Public can read active doctors" on doctors
  for select using (is_active = true);

-- Services, operating hours and specialties stay unconditional: they are
-- directory content with no per-row privacy, and every column is meant to be
-- public. They are scoped by the hospital row you had to be able to see first.
