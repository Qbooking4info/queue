import { randomBytes } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyTransaction } from '@/lib/paystack'

// Wallet money rules live in SQL (20261012000004_wallet.sql): wallet_apply() and
// wallet_settle_topup() lock the row, never go negative, and settle once.

export const TOPUP_MIN_NAIRA = 500
export const TOPUP_MAX_NAIRA = 500_000

export const isWalletRef = (ref: string) => ref.startsWith('WAL-')
export function buildWalletReference(userId: string) {
  return `WAL-${userId.slice(0, 8)}-${randomBytes(5).toString('hex').toUpperCase()}`
}

/**
 * Settle a top-up after asking Paystack directly what happened -- used by both the
 * webhook and the app's post-checkout verify. Safe to call any number of times.
 */
export async function settleWalletTopup(db: ReturnType<typeof createAdminClient>, reference: string):
  Promise<'credited' | 'already' | 'unknown' | 'mismatch' | 'pending' | 'failed'> {
  const v = await verifyTransaction(reference)
  if (v.status !== 'success') {
    if (v.status === 'failed' || v.status === 'abandoned') {
      await (db as any).from('wallet_transactions').update({ status: 'failed' } as never).eq('paystack_ref', reference).eq('status', 'pending')
      return v.status === 'failed' ? 'failed' : 'pending'
    }
    return 'pending'
  }
  const { data, error } = await (db as any).rpc('wallet_settle_topup', { p_ref: reference, p_confirmed_kobo: v.amount })
  if (error) throw new Error(error.message)
  return data as 'credited' | 'already' | 'unknown' | 'mismatch'
}
