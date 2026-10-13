-- Repair campaign REP-059/060/061 (P0/P1): privilege escalation through policies that
-- exist only in production (read from pg_policies 2026-10-13; none is in an earlier repo
-- migration). Every legitimate write to the tables locked down here is server-side with
-- the service role (inventory in docs/repair/ISSUES.md REP-059).

-- ---------------------------------------------------------------------------
-- REP-059 (P0): staff could rewrite their own hospital_admins row
-- ---------------------------------------------------------------------------
-- "admins_update_own" = UPDATE where user_id is the caller, no WITH CHECK, every column
-- updatable: front desk / crew / specialist could set role='owner', move hospital_id to
-- ANY hospital (and read its patients), or re-activate themselves after removal.
drop policy if exists "admins_update_own" on public.hospital_admins;
revoke insert, update, delete on public.hospital_admins from anon, authenticated;

-- ---------------------------------------------------------------------------
-- REP-060 (P1): is_hospital_admin() admitted crew and deactivated staff
-- ---------------------------------------------------------------------------
-- It gates doctors/services/time_slots/availability/slot_overrides/hospital_images/
-- operating hours/specialties/emr/appointment_documents/payouts policies. Same rule as
-- my_staff_hospital_ids(): active, and not ambulance crew.
create or replace function public.is_hospital_admin(hospital_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from hospital_admins ha
    join users u on u.id = ha.user_id
    where ha.hospital_id = hospital_uuid
      and u.auth_id = auth.uid()
      and ha.is_active
      and coalesce(ha.role, 'admin') <> 'ambulance_crew'
  );
$$;

-- ---------------------------------------------------------------------------
-- REP-061 (P1): any signed-in user could write subscriptions / hours / specialties of
-- ANY hospital, and any staff member could edit any review of their hospital
-- ---------------------------------------------------------------------------
drop policy if exists "hospital_subs_insert" on public.hospital_subscriptions;   -- WITH CHECK auth.uid() IS NOT NULL
drop policy if exists "hospital_subs_update" on public.hospital_subscriptions;   -- an admin could change the plan
revoke insert, update, delete on public.hospital_subscriptions from anon, authenticated;

drop policy if exists "hospital_hours_insert" on public.hospital_operating_hours;
revoke insert, update, delete on public.hospital_operating_hours from anon, authenticated;

drop policy if exists "hospital_specialties_insert" on public.hospital_specialties;
revoke insert, update, delete on public.hospital_specialties from anon, authenticated;

drop policy if exists "Hospital admins can reply to reviews" on public.reviews;  -- rating/visibility editable by any staff
revoke update, delete on public.reviews from anon, authenticated;              -- patients still INSERT their review

-- ---------------------------------------------------------------------------
-- REP-062 (P0 when combined with /api/dependents/switch): users could set any email
-- ---------------------------------------------------------------------------
-- "users_update_own" has no WITH CHECK and is OR'd with the stricter "Users can update
-- own profile", so the email rule there never applied. The switch route used
-- users.email to mint a magic link (now fixed to use the auth email), which turned an
-- edited profile email into a session for the victim's account. Dropping the loose
-- policy would lock 7 existing users (profile email differs from their login) out of
-- push-token/avatar updates, so instead: a profile may not move its auth_id, and may
-- only change email to the address it signs in with.
create or replace function public.guard_user_identity_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
begin
  if v_role not in ('authenticated', 'anon') then
    return new;   -- service role, cron, SQL
  end if;
  if new.auth_id is distinct from old.auth_id then
    raise exception 'auth_id cannot be changed' using errcode = '42501';
  end if;
  if new.email is distinct from old.email
     and lower(coalesce(new.email, '')) is distinct from lower(coalesce(auth.jwt() ->> 'email', '')) then
    raise exception 'email can only be changed to the address you sign in with' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_user_identity_columns() from public, anon, authenticated;

drop trigger if exists guard_user_identity_columns on public.users;
create trigger guard_user_identity_columns
  before update on public.users
  for each row execute function public.guard_user_identity_columns();
