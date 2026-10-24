-- Repair campaign REP-044: one booking could be paid twice (wallet + card, or two
-- checkouts), both rows ending 'success'. The webhook now credits a second charge to the
-- payer's wallet and records it as 'refunded'; this index is the backstop for two
-- charges settling at the same moment -- the losing update gets 23505 and takes that
-- same credit path (web/src/app/api/payments/webhook/route.ts).
-- Aborts if a booking already has two success rows: resolve those first.
create unique index if not exists one_success_payment_per_appointment
  on public.payments (appointment_id)
  where status = 'success' and appointment_id is not null;
