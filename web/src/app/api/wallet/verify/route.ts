import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getServerUser } from '@/lib/supabase/auth-server'
import { Errors } from '@/lib/api-error'
import { isWalletRef, settleWalletTopup } from '@/lib/wallet'
import { AUTH_CORS_HEADERS, corsOptions } from '@/lib/cors'

export async function OPTIONS() { return corsOptions() }

/** POST /api/wallet/verify { reference } -- the app calls this after checkout closes. */
export async function POST(req: NextRequest) {
  const res = await handle(req)
  for (const [k, v] of Object.entries(AUTH_CORS_HEADERS)) res.headers.set(k, v)
  return res
}

async function handle(req: NextRequest) {
  const user = await getServerUser(req)
  if (!user) return Errors.unauthenticated()
  const { reference } = await req.json().catch(() => ({})) as { reference?: string }
  if (!reference || !isWalletRef(reference)) return Errors.validation('reference is required')

  const db = createAdminClient()
  const { data: caller } = await db.from('users').select('id').eq('auth_id', user.id).single()
  const { data: tx } = await (db as any).from('wallet_transactions').select('user_id').eq('paystack_ref', reference).maybeSingle()
  if (!caller || !tx || (tx as { user_id: string }).user_id !== caller.id) return Errors.notFound('Top-up')

  try {
    const result = await settleWalletTopup(db, reference)
    return NextResponse.json({ status: result === 'credited' || result === 'already' ? 'success' : result })
  } catch (err) {
    return Errors.internal(err instanceof Error ? err.message : 'Could not verify')
  }
}
