-- Repair campaign REP-051: staff at an unverified (pending-review) hospital could not
-- read their own hospital row. The only SELECT policy on hospitals is
-- `is_active AND is_verified` (the public directory), so the Hospital and Ambulance apps'
-- direct reads returned nothing: blank hospital names, no Clinics menu, no clinic filter.
--
-- Per the project rule, staff-scoped lookups from mobile go through a SECURITY DEFINER
-- RPC rather than widening table policies. Returns the row only when the caller is an
-- active member of that hospital's staff (any hospital_admins role, incl. crew, or a
-- clinic admin / front desk of one of its clinics).
create or replace function public.get_my_hospital(p_hospital_id uuid)
returns table (id uuid, name text, clinic_model text)
language sql
stable
security definer
set search_path = public
as $$
  select h.id, h.name, h.clinic_model::text
    from hospitals h
   where h.id = p_hospital_id
     and exists (
       select 1 from users u
        where u.auth_id = auth.uid()
          and (exists (select 1 from hospital_admins ha
                        where ha.user_id = u.id and ha.hospital_id = h.id and ha.is_active)
            or exists (select 1 from clinic_admins ca
                        where ca.user_id = u.id and ca.hospital_id = h.id and coalesce(ca.is_active, true))));
$$;
revoke all on function public.get_my_hospital(uuid) from public, anon;
grant execute on function public.get_my_hospital(uuid) to authenticated, service_role;
