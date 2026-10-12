import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit } from '@/lib/rate-limit'
import { AUTH_CORS_HEADERS, corsOptions } from '@/lib/cors'
import type { Channel } from '@/lib/otp-delivery'
import {
  hashCode, hashesMatch, normaliseDestination, generateClaimToken, MAX_ATTEMPTS,
} from '@/lib/verification'

/**
 * POST /api/auth/verify/confirm — check a code and, on success, hand back a
 * single-use claim token that /api/auth/register will spend.
 *
 * The token is what makes verification enforceable. Without it, registration would
 * have to trust the client's word that a code was checked, which is no check at
 * all.
 */

const adminDb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

export async function OPTIONS() {
  return corsOptions()
}

export async function POST(req: NextRequest) {
  const res = await handle(req)
  for (const [k, v] of Object.entries(AUTH_CORS_HEADERS)) res.headers.set(k, v)
  return res
}

async function handle(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as { destination?: string; channel?: string; code?: string }
  const channel = body.channel === 'sms' ? 'sms' : body.channel === 'email' ? 'email' : null
  if (!channel) return NextResponse.json({ error: 'channel must be email or sms' }, { status: 400 })

  const norm = normaliseDestination(channel as Channel, body.destination ?? '')
  if (!norm.ok) return NextResponse.json({ error: norm.error }, { status: 400 })
  const destination = norm.value

  const code = (body.code ?? '').trim()
  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: 'Enter the 6-digit code.' }, { status: 400 })
  }

  // Guards the guess rate even across freshly requested codes, so an attacker
  // cannot reset their attempt budget by asking for a new code each time.
  const allowed = await checkRateLimit(adminDb, `otp-confirm:${destination}`, 15, 3600)
  if (!allowed) {
    return NextResponse.json({ error: 'Too many attempts. Please wait an hour and try again.' }, { status: 429 })
  }

  const { data: row } = await adminDb
    .from('signup_verifications')
    .select('id, code_hash, expires_at, attempts, consumed_at')
    .eq('destination', destination)
    .is('consumed_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // One message for "no code", "expired" and "wrong code" on purpose. Distinct
  // errors would confirm which addresses and numbers have a signup in progress.
  const reject = () =>
    NextResponse.json({ error: 'That code is invalid or has expired. Request a new one.' }, { status: 400 })

  if (!row) return reject()
  if (new Date(row.expires_at).getTime() < Date.now()) return reject()

  if (row.attempts >= MAX_ATTEMPTS) {
    await adminDb.from('signup_verifications')
      .update({ consumed_at: new Date().toISOString() }).eq('id', row.id)
    return reject()
  }

  if (!hashesMatch(row.code_hash, hashCode(code, destination))) {
    await adminDb.from('signup_verifications')
      .update({ attempts: row.attempts + 1 }).eq('id', row.id)
    return reject()
  }

  const claimToken = generateClaimToken()
  const { error } = await adminDb.from('signup_verifications')
    .update({ verified_at: new Date().toISOString(), claim_token: claimToken })
    .eq('id', row.id)
    .is('consumed_at', null)   // re-check: a concurrent confirm must not issue two tokens
  if (error) {
    console.error('[verify/confirm] could not mark verified', error.message)
    return NextResponse.json({ error: 'Could not verify. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ verified: true, destination, channel, claimToken })
}
