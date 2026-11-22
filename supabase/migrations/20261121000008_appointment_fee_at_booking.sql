-- What a booking costs was never written down on the booking.
--
-- A direct booking quotes the doctor's virtual_fee or home_visit_fee at the
-- moment the patient books. Those live on the doctor and the doctor can change
-- them whenever they like, so a screen showing "the fee" against last week's
-- appointment was showing today's price -- for an appointment that was agreed
-- at a different one. The doctor's own schedule screen therefore showed no fee
-- at all rather than a number that might be wrong.
--
-- One column, written at booking, never updated afterwards. The same reason
-- refund_pct and payment_method are already stamped on the row: what was
-- agreed is a property of the agreement, not of the doctor's current price
-- list.

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS consultation_fee numeric(12,2)
    CHECK (consultation_fee IS NULL OR consultation_fee >= 0);

COMMENT ON COLUMN appointments.consultation_fee IS
  'What this booking was quoted at, in naira, stamped at creation and never revised. NULL where no fee was quoted (a hospital OPD visit priced by the hospital, or a walk-in). Do not read the doctor''s current fee in its place -- that is the bug this column exists to fix.';

-- Backfill is deliberately NOT attempted. The doctor's fee today is not
-- evidence of what any past booking was quoted at, and writing it in would
-- manufacture a price history that never happened. Existing rows keep NULL and
-- the screens say nothing about their fee, which is the truth.

-- Verification (read-only; run after applying)
--   select count(*) filter (where consultation_fee is not null) from appointments;  -- 0
--   -- then make a direct booking and check the new row carries its fee.
