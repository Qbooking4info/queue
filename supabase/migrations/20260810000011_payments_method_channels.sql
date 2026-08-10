-- Queue — align payments.method with Paystack's channel vocabulary
--
-- The existing CHECK on payments.method predates the payment integration and
-- accepts only a couple of values (card, ussd). Paystack reports the channel a
-- transaction actually used, and its vocabulary is wider — bank, bank_transfer,
-- qr, mobile_money, eft, apple_pay.
--
-- Found by running a real transaction end to end: initialize failed with
-- payments_method_check because the code wrote method='paystack'. That would
-- have surfaced on the first live payment rather than in review, since nothing
-- writes to this table today.
--
-- Two changes:
--
--  1. The constraint accepts every channel Paystack can report, plus the
--     off-platform methods a front desk records (cash, pos, transfer, hmo) —
--     which the old list also could not express.
--
--  2. method is now nullable and means "how it was actually paid". It is set
--     when the payment succeeds, not when it is initialised: at initialise the
--     channel is genuinely unknown, and writing a placeholder like 'paystack'
--     conflates the processor with the instrument.

alter table payments drop constraint if exists payments_method_check;

alter table payments
  add constraint payments_method_check check (
    method is null or method in (
      -- Paystack transaction channels
      'card', 'bank', 'bank_transfer', 'ussd', 'qr', 'mobile_money', 'eft', 'apple_pay',
      -- recorded off-platform by staff
      'cash', 'pos', 'transfer', 'hmo'
    )
  );

comment on column payments.method is
  'How the payment was actually made — a Paystack channel for online payments, or an off-platform method recorded by staff. NULL until the payment succeeds; the channel is not known at initialisation.';
