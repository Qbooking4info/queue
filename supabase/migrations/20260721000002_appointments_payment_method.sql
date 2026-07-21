ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'card';
