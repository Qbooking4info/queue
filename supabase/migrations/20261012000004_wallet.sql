-- Patient wallet: a balance plus an append-only ledger.
--
-- Clients can READ their own wallet and history, never write. Every balance change
-- goes through wallet_apply() / wallet_settle_topup(), which are callable by the
-- service role only (Next.js API routes), lock the wallet row, and refuse to take the
-- balance below zero. Amounts are integer kobo throughout -- no floating point money.

CREATE TABLE IF NOT EXISTS public.wallets (
  user_id      uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  balance_kobo bigint NOT NULL DEFAULT 0 CHECK (balance_kobo >= 0),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type               text NOT NULL CHECK (type IN ('topup', 'payment', 'refund', 'adjustment')),
  amount_kobo        bigint NOT NULL CHECK (amount_kobo <> 0),       -- + credit, - debit
  balance_after_kobo bigint,
  status             text NOT NULL DEFAULT 'success' CHECK (status IN ('pending', 'success', 'failed')),
  paystack_ref       text UNIQUE,
  appointment_id     uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  description        text,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wallet_tx_user_created_idx ON public.wallet_transactions (user_id, created_at DESC);
-- One wallet payment per appointment, so a double tap can't charge twice.
CREATE UNIQUE INDEX IF NOT EXISTS wallet_tx_one_payment_per_appt
  ON public.wallet_transactions (appointment_id) WHERE type = 'payment' AND status = 'success';

ALTER TABLE public.wallets             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.wallets, public.wallet_transactions FROM anon, authenticated;
GRANT SELECT ON public.wallets, public.wallet_transactions TO authenticated;

DROP POLICY IF EXISTS wallets_select_own ON public.wallets;
CREATE POLICY wallets_select_own ON public.wallets FOR SELECT TO authenticated
  USING (user_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

DROP POLICY IF EXISTS wallet_tx_select_own ON public.wallet_transactions;
CREATE POLICY wallet_tx_select_own ON public.wallet_transactions FOR SELECT TO authenticated
  USING (user_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

-- Apply a settled credit/debit. Raises 'insufficient_funds' rather than going negative.
CREATE OR REPLACE FUNCTION public.wallet_apply(
  p_user uuid, p_amount_kobo bigint, p_type text,
  p_ref text DEFAULT NULL, p_appointment uuid DEFAULT NULL, p_description text DEFAULT NULL
) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_balance bigint;
BEGIN
  INSERT INTO public.wallets (user_id) VALUES (p_user) ON CONFLICT (user_id) DO NOTHING;
  SELECT balance_kobo INTO v_balance FROM public.wallets WHERE user_id = p_user FOR UPDATE;
  IF v_balance + p_amount_kobo < 0 THEN
    RAISE EXCEPTION 'insufficient_funds' USING ERRCODE = 'P0001';
  END IF;
  v_balance := v_balance + p_amount_kobo;
  UPDATE public.wallets SET balance_kobo = v_balance, updated_at = now() WHERE user_id = p_user;
  INSERT INTO public.wallet_transactions (user_id, type, amount_kobo, balance_after_kobo, status, paystack_ref, appointment_id, description)
  VALUES (p_user, p_type, p_amount_kobo, v_balance, 'success', p_ref, p_appointment, p_description);
  RETURN v_balance;
END;
$$;

-- Settle a pending Paystack top-up exactly once, only if the confirmed amount matches.
-- Returns 'credited' | 'already' | 'unknown' | 'mismatch'.
CREATE OR REPLACE FUNCTION public.wallet_settle_topup(p_ref text, p_confirmed_kobo bigint)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tx public.wallet_transactions%ROWTYPE; v_balance bigint;
BEGIN
  SELECT * INTO v_tx FROM public.wallet_transactions WHERE paystack_ref = p_ref FOR UPDATE;
  IF v_tx.id IS NULL THEN RETURN 'unknown'; END IF;
  IF v_tx.status = 'success' THEN RETURN 'already'; END IF;
  IF v_tx.amount_kobo <> p_confirmed_kobo THEN
    UPDATE public.wallet_transactions SET status = 'failed', description = coalesce(description, '') || ' (amount mismatch)' WHERE id = v_tx.id;
    RETURN 'mismatch';
  END IF;
  INSERT INTO public.wallets (user_id) VALUES (v_tx.user_id) ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.wallets SET balance_kobo = balance_kobo + v_tx.amount_kobo, updated_at = now()
   WHERE user_id = v_tx.user_id RETURNING balance_kobo INTO v_balance;
  UPDATE public.wallet_transactions SET status = 'success', balance_after_kobo = v_balance WHERE id = v_tx.id;
  RETURN 'credited';
END;
$$;

REVOKE ALL ON FUNCTION public.wallet_apply(uuid, bigint, text, text, uuid, text), public.wallet_settle_topup(text, bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wallet_apply(uuid, bigint, text, text, uuid, text), public.wallet_settle_topup(text, bigint)
  TO service_role;
