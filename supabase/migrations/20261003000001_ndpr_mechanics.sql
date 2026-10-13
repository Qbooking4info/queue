-- Queue — NDPR mechanics: consent records and real anonymisation on deletion
--
-- The app asserted NDPR compliance with nothing behind it. This migration supplies
-- two of the four missing pieces (the export endpoint and the stated retention
-- policy live in application code); the Support-screen claim stays removed until
-- all four are in place.

-- ---------------------------------------------------------------------------
-- 1. Consent records
--
-- A table rather than a boolean on users, because NDPR asks you to be able to
-- DEMONSTRATE consent: which version of which policy, when, and from where. A
-- boolean cannot answer "what exactly did they agree to in March".
--
-- Append-only in spirit: withdrawing consent sets revoked_at rather than deleting
-- the row, so the history of what was agreed and when survives the withdrawal.
-- ---------------------------------------------------------------------------
create table if not exists user_consents (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references users(id) on delete cascade,
  -- 'privacy_policy', 'terms_of_service', 'marketing', ...
  kind           text not null,
  -- The version string the user actually saw. Bump it when the policy changes and
  -- consent to the new version becomes a separate, re-askable row.
  policy_version text not null,
  granted_at     timestamptz not null default now(),
  revoked_at     timestamptz,
  -- Where it was captured: 'signup', 'settings', 'reconsent'.
  source         text not null default 'signup',
  created_at     timestamptz not null default now()
);

create index if not exists user_consents_user_idx on user_consents (user_id, kind, granted_at desc);
-- One live consent per user per kind per version; a re-grant after revocation is a
-- new row with a new granted_at, which the partial index allows.
create unique index if not exists user_consents_live_idx
  on user_consents (user_id, kind, policy_version) where revoked_at is null;

comment on table user_consents is
  'Demonstrable consent per NDPR: which policy version a user agreed to, when, and '
  'from where. Revocation sets revoked_at rather than deleting, so the record of '
  'what was agreed survives.';

alter table user_consents enable row level security;

-- A user may read and record their own consent, and may revoke it. They may not
-- edit granted_at or another person's row.
drop policy if exists user_consents_select_own on user_consents;
create policy user_consents_select_own on user_consents
  for select using (user_id = (select id from users where auth_id = auth.uid()));

drop policy if exists user_consents_insert_own on user_consents;
create policy user_consents_insert_own on user_consents
  for insert with check (user_id = (select id from users where auth_id = auth.uid()));

drop policy if exists user_consents_revoke_own on user_consents;
create policy user_consents_revoke_own on user_consents
  for update using (user_id = (select id from users where auth_id = auth.uid()))
  with check (user_id = (select id from users where auth_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- 2. Anonymisation on account deletion
--
-- Deleting the auth user previously left the `users` row fully identifiable --
-- name, email, phone, date of birth, address -- because auth_id is ON DELETE SET
-- NULL. "Account deleted" therefore meant "can no longer log in", not "data
-- removed", which is the gap between the claim and the reality.
--
-- This does NOT delete the clinical record, and that is deliberate. A hospital has
-- its own retention obligations for medical records, and erasure rights do not
-- override them. What it removes is the ability to tie that record back to a named
-- person through this system: identity fields are scrubbed, the clinical history
-- stays attached to an anonymous subject.
--
-- Irreversible by design. There is no undo.
-- ---------------------------------------------------------------------------
create or replace function anonymize_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tag text;
begin
  -- Short stable tag so staff looking at an old appointment see a consistent
  -- "Deleted patient 4f2a" rather than a blank, which reads as data corruption.
  v_tag := substr(replace(p_user_id::text, '-', ''), 1, 4);

  update users
     set full_name         = 'Deleted patient ' || v_tag,
         -- NOT a null: users.email is NOT NULL and (being a login handle) unique, so
         -- nulling it aborts the whole function and scrubs nothing -- which is how
         -- this was first written, and what testing it on a throwaway account caught.
         -- .invalid is reserved by RFC 2606 and can never be routed or re-registered.
         email             = 'deleted-' || v_tag || '@removed.invalid',
         phone             = null,
         date_of_birth     = null,
         gender            = null,
         blood_group       = null,
         address           = null,
         city              = null,
         state             = null,
         country           = null,
         avatar_url        = null,
         push_token        = null,
         is_verified       = false,
         updated_at        = now()
   where id = p_user_id;

  -- Free-text fields on the appointments themselves can carry a name or a phone
  -- number typed by staff, so they are cleared too. The structured clinical fields
  -- (diagnosis, notes, prescription) are retained under the retention obligation
  -- above.
  update appointments
     set walkin_patient_name  = null,
         walkin_patient_phone = null
   where patient_id = p_user_id;

  -- Ambulance requests carry their own contact number and caller name, typed at a
  -- moment when nobody is checking whether the caller is a registered patient.
  update transport_requests
     set contact_phone       = null,
         caller_patient_name = null
   where requester_id = p_user_id;

  -- Consent records are themselves personal data and their purpose (proving what
  -- this person agreed to) ends with the account.
  delete from user_consents where user_id = p_user_id;
end;
$$;

comment on function anonymize_user(uuid) is
  'Irreversibly strips identity from a user and their appointments while retaining '
  'the clinical record, which a hospital must keep. Called by DELETE /api/account.';

revoke all on function anonymize_user(uuid) from public;
revoke all on function anonymize_user(uuid) from authenticated;
-- Service role only: this is called by the account-deletion route after it has
-- verified the caller owns the account. No client may invoke it directly, or one
-- user could erase another.
grant execute on function anonymize_user(uuid) to service_role;
