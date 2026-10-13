import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getServerUser } from '@/lib/supabase/auth-server'
import { Errors } from '@/lib/api-error'
import { paystackConfigured, initializeTransaction } from '@/lib/paystack'
import { buildWalletReference, TOPUP_MIN_NAIRA, TOPUP_MAX_NAIRA } from '@/lib/wallet'
import { AUTH_CORS_HEADERS, corsOptions } from '@/lib/cors'

export async function OPTIONS() { return corsOptions() }

/**
 * POST /api/wallet/topup  { amount }   (naira, whole number)
 * Records a pending top-up, then opens Paystack checkout. The balance only moves
 * when the webhook (or /api/wallet/verify) confirms the exact amount with Paystack.
 */
export async function POST(req: NextRequest) {
  const res = await handle(req)
  for (const [k, v] of Object.entries(AUTH_CORS_HEADERS)) res.headers.set(k, v)
  return res
}

async function handle(req: NextRequest) {
  if (!paystackConfigured()) return NextResponse.json({ error: 'Online payment is not enabled', code: 'PAYMENTS_DISABLED' }, { status: 503 })
  const user = await getServerUser(req)
  if (!user) return Errors.unauthenticated()

  const { amount } = await req.json().catch(() => ({})) as { amount?: number }
  const naira = Math.round(Number(amount))
  if (!Number.isFinite(naira) || naira < TOPUP_MIN_NAIRA || naira > TOPUP_MAX_NAIRA) {
    return Errors.validation(`Top up between ₦${TOPUP_MIN_NAIRA.toLocaleString()} and ₦${TOPUP_MAX_NAIRA.toLocaleString()}`)
  }

  const db = createAdminClient()
  const { data: caller } = await db.from('users').select('id, email').eq('auth_id', user.id).single()
  if (!caller) return Errors.notFound('User')
  const email = (caller.email ?? user.email ?? '').trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return Errors.validation('Add a valid email to your profile to top up.')

  const reference = buildWalletReference(caller.id)
  const { error: insErr } = await (db as any).from('wallet_transactions').insert({
    user_id: caller.id, type: 'topup', amount_kobo: naira * 100, status: 'pending', paystack_ref: reference, description: 'Wallet top-up',
  } as never)
  if (insErr) return Errors.internal(insErr.message)

  try {
    const r = await initializeTransaction({
      email, amountKobo: naira * 100, reference,
      callbackUrl: process.env.NEXT_PUBLIC_SITE_URL ? `${process.env.NEXT_PUBLIC_SITE_URL}/payment/complete` : undefined,
      metadata: { kind: 'wallet_topup', user_id: caller.id },
    })
    return NextResponse.json({ authorizationUrl: r.authorization_url, reference: r.reference })
  } catch (err) {
    await (db as any).from('wallet_transactions').update({ status: 'failed' } as never).eq('paystack_ref', reference)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not start the top-up', code: 'PAYSTACK_ERROR' }, { status: 502 })
  }
}
