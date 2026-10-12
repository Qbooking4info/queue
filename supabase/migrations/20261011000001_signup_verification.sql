-- Queue — verify a new patient's email or phone before the account exists
--
-- Registration today is a client-side supabase.auth.signUp(), which means any
-- check performed in the app can be skipped by calling Supabase directly with the
-- anon key. For verification to actually gate registration, the account has to be
-- created server-side by a route that will not proceed without proof. This table
-- is that proof.
--
-- No RLS policies and no grants to anon/authenticated on purpose: nothing but the
-- service-role routes may read or write this. A client that could SELECT here
-- would read the codes (hashes, but still) and could enumerate which emails and
-- phone numbers are mid-signup.

create table if not exists signup_verifications (
  id            uuid primary key default gen_random_uuid(),
  -- Normalised before storage: email lower-cased, phone in E.164. Matching on a
  -- raw string would let "+2348012345678" and "08012345678" hold separate codes
  -- for the same person and separate rate-limit budgets.
  destination   text not null,
  channel       text not null check (channel in ('email', 'sms')),
  -- The code is never stored. A database read, a backup, or a log that captured a
  -- row must not hand anyone a working code.
  code_hash     text not null,
  expires_at    timestamptz not null,
  attempts      integer not null default 0,
  verified_at   timestamptz,
  -- Returned once, on successful verification, and spent by the register route.
  -- Lets registration prove "this destination was verified" without the client
  -- holding anything it could forge.
  claim_token   text,
  consumed_at   timestamptz,
  created_at    timestamptz not null default now()
);

-- Lookups are always "the newest live code for this destination".
create index if not exists signup_verifications_dest_idx
  on signup_verifications (destination, created_at desc);
-- A claim token must resolve in one hit and must be unique when present.
create unique index if not exists signup_verifications_claim_idx
  on signup_verifications (claim_token) where claim_token is not null;

comment on table signup_verifications is
  'Pre-registration email/SMS verification codes. Service-role only: no RLS policy '
  'and no client grants, so codes cannot be read and signups cannot be enumerated.';

alter table signup_verifications enable row level security;
-- RLS on with zero policies = deny all for anon and authenticated. The routes use
-- the service role, which bypasses RLS. This is deliberate, not an omission.

revoke all on table signup_verifications from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Housekeeping
--
-- These rows are short-lived by nature and hold a (hashed) secret plus a contact
-- detail, so they are cleared promptly rather than kept for the 90-day
-- operational window that covers logs and GPS trails.
-- ---------------------------------------------------------------------------
create or replace function purge_expired_signup_verifications()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_n integer;
begin
  delete from signup_verifications
   where created_at < now() - interval '24 hours';
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

comment on function purge_expired_signup_verifications() is
  'Clears signup verification rows after 24h. They carry a contact detail and a '
  'code hash, so they go sooner than the general 90-day operational window.';

revoke all on function purge_expired_signup_verifications() from public, authenticated;
grant execute on function purge_expired_signup_verifications() to service_role;

select cron.unschedule('purge-signup-verifications')
 where exists (select 1 from cron.job where jobname = 'purge-signup-verifications');

select cron.schedule(
  'purge-signup-verifications',
  '40 3 * * *',
  $$select purge_expired_signup_verifications();$$
);
