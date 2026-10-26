-- Repair campaign REP-058 (P0): clients could write the hospitals table directly.
--
-- Found reading production pg_policies on 2026-10-13 (neither policy is in any repo
-- migration):
--   hospitals_admin_update  UPDATE for ANY hospital_admins row of that hospital -- any role
--                           (ambulance_crew, front_desk, specialist), active or not -- with
--                           UPDATE privilege on every column. A crew member could set
--                           paystack_subaccount_code (redirect the hospital's payouts),
--                           and any admin could set is_verified = true on their own
--                           self-onboarded hospital.
--   hospitals_auth_insert   INSERT for any signed-in user, any values (incl. is_verified).
--
-- Every legitimate write is server-side with the service role (/api/onboarding,
-- /api/hospitals/[id]/settings, /api/payments/subaccount, dashboard server actions,
-- fleet routes). The two functions that update hospitals from a trigger/cron
-- (recalculate_hospital_rating, recompute_denormalised_counters) are SECURITY DEFINER,
-- so they keep working. Read policies are unchanged.
drop policy if exists "hospitals_admin_update" on public.hospitals;
drop policy if exists "hospitals_auth_insert" on public.hospitals;
revoke insert, update, delete on public.hospitals from anon, authenticated;
