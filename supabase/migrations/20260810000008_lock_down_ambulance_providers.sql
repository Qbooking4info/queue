-- Queue — stop publishing ambulance provider commercial terms to the world
--
-- ambulance_providers was readable by anon. The publishable key is compiled into
-- the mobile app, so "readable by anon" means readable by anyone who downloads
-- the APK. That exposed, for every provider on the platform:
--
--   contact_phone, contact_email  — direct line to each operator
--   commission_rate               — YOUR take rate with that operator
--   reliability_score             — internal performance score
--
-- Commission rate is the damaging one. A competitor can read exactly what Queue
-- charges each provider, and a provider can read what every other provider pays.
-- Same shape as the get_daily_booking_count leak in AUDIT-FINDINGS.md: a table
-- opened up for one legitimate read, with no column scoping.
--
-- Nothing client-side needs this table. The patient app never queries it; the
-- provider name reaches the tracking screen through get_my_active_job() and the
-- dispatch engine reads it with the service role. Verified by grep: zero
-- client-side references.
--
-- A view is provided rather than nothing at all, so a future "who covers my
-- area?" screen has a safe, name-and-tier-only surface to build on instead of
-- re-opening the table.

revoke all on ambulance_providers from anon, authenticated;

alter table ambulance_providers enable row level security;

-- Platform admins manage providers through the dashboard (service role); this
-- policy exists so an authenticated super_admin session isn't locked out of
-- future admin UI.
drop policy if exists ambulance_providers_admin_all on ambulance_providers;
create policy ambulance_providers_admin_all on ambulance_providers
  for all
  using (exists (
    select 1 from platform_admins pa
      join users u on u.id = pa.user_id
     where u.auth_id = auth.uid() and pa.is_active
  ))
  with check (exists (
    select 1 from platform_admins pa
      join users u on u.id = pa.user_id
     where u.auth_id = auth.uid() and pa.is_active
  ));

-- Safe projection: identity only. No contact details, no commercial terms.
create or replace view ambulance_providers_public as
  select id, name, provider_type, is_verified
    from ambulance_providers
   where is_active;

comment on view ambulance_providers_public is
  'Identity-only projection of ambulance_providers. The base table carries commission_rate and direct contact details and must never be exposed to anon or authenticated.';

grant select on ambulance_providers_public to anon, authenticated;
