-- Queue — Paystack settlement wiring
--
-- The payments table was already shaped for Paystack (paystack_ref,
-- paystack_access_code, platform_fee, hospital_payout) but nothing ever wrote to
-- it. This adds the missing half: where a hospital's share actually settles.
--
-- Model: Paystack subaccounts with a transaction split. The patient is charged
-- once; Paystack settles the consultation fee to the hospital's own bank account
-- and the platform fee to Queue. Queue never holds the hospital's money, which
-- avoids becoming a de facto payment institution — a materially different
-- regulatory position in Nigeria, and not one to enter by accident.
--
-- A hospital without a subaccount can still take bookings; payment simply stays
-- off for that hospital rather than silently routing their money to Queue's
-- account. That failure mode is deliberate: quietly collecting a hospital's
-- revenue into someone else's balance is far worse than a disabled button.

alter table hospitals
  add column if not exists paystack_subaccount_code text,
  add column if not exists paystack_bank_name       text,
  add column if not exists paystack_account_last4   text;

comment on column hospitals.paystack_subaccount_code is
  'Paystack subaccount (ACCT_xxx) that the hospital''s share of each transaction settles to. NULL means online payment is disabled for this hospital — bookings still work, payment is taken at the desk.';
comment on column hospitals.paystack_account_last4 is
  'Last 4 digits only, for display confirmation. Full account numbers are held by Paystack, never here.';

create index if not exists hospitals_paystack_subaccount_idx
  on hospitals (paystack_subaccount_code)
  where paystack_subaccount_code is not null;

-- ---------------------------------------------------------------------------
-- payments: idempotency and lifecycle
-- ---------------------------------------------------------------------------

-- Webhooks are delivered at-least-once and retried. Without a unique reference
-- a retry books the payment twice — and because the webhook also confirms the
-- appointment, a duplicate would double-count revenue and re-notify the patient.
create unique index if not exists payments_paystack_ref_key
  on payments (paystack_ref)
  where paystack_ref is not null;

alter table payments
  add column if not exists verified_at    timestamptz,
  add column if not exists webhook_event  text,
  add column if not exists failure_reason text;

comment on column payments.verified_at is
  'Set only after the amount was confirmed server-side — via webhook signature or a Paystack verify call. A row without this has NOT been proven paid, whatever the client reported.';

-- payments holds financial records; no client role touches it directly.
alter table payments enable row level security;
revoke all on payments from anon, authenticated;

-- Patients may read their own payment history through the app.
drop policy if exists payments_own_read on payments;
create policy payments_own_read on payments
  for select
  using (patient_id = (select id from users where auth_id = auth.uid()));
grant select on payments to authenticated;
