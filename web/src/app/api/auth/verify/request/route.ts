import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit } from '@/lib/rate-limit'
import { AUTH_CORS_HEADERS, corsOptions } from '@/lib/cors'
import { deliverCode, channelConfigured, type Channel } from '@/lib/otp-delivery'
import { generateCode, hashCode, normaliseDestination, CODE_TTL_MINUTES } from '@/lib/verification'

/**
 * POST /api/auth/verify/request — send a signup code to an email or phone.
 *
 * Open to unauthenticated callers by necessity: the whole point is that no account
 * exists yet. That makes rate limiting the only thing standing between this and
 * (a) using the platform's SMS credit to spam a stranger's phone, and (b) mapping
 * which emails are already registered. Both are handled below.
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
  const body = await req.json().catch(() => ({})) as { destination?: string; channel?: string }
  const channel = body.channel === 'sms' ? 'sms' : body.channel === 'email' ? 'email' : null
  if (!channel) return NextResponse.json({ error: 'channel must be email or sms' }, { status: 400 })

  const norm = normaliseDestination(channel as Channel, body.destination ?? '')
  if (!norm.ok) return NextResponse.json({ error: norm.error }, { status: 400 })
  const destination = norm.value

  // Two separate budgets. Per-destination stops someone being texted repeatedly;
  // per-IP stops one caller walking a list of numbers to burn SMS credit.
  const perDest = await checkRateLimit(adminDb, `otp-req:${destination}`, 5, 3600)
  if (!perDest) {
    return NextResponse.json({ error: 'Too many codes requested. Please wait an hour and try again.' }, { status: 429 })
  }
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const perIp = await checkRateLimit(adminDb, `otp-req-ip:${ip}`, 20, 3600)
  if (!perIp) {
    return NextResponse.json({ error: 'Too many requests from this device. Please try again later.' }, { status: 429 })
  }

  // Tell the caller honestly when nothing can be delivered, rather than claiming a
  // code is on its way to a phone that will never receive one.
  if (!channelConfigured(channel as Channel)) {
    return NextResponse.json({
      error: channel === 'sms'
        ? 'SMS verification is not available yet. Please verify with your email address instead.'
        : 'Email verification is not available yet. Please try again later.',
      code: 'CHANNEL_NOT_CONFIGURED',
    }, { status: 503 })
  }

  // Supersede any earlier live code for this destination, so a second request
  // invalidates the first rather than leaving two valid codes in flight.
  await adminDb.from('signup_verifications')
    .update({ consumed_at: new Date().toISOString() })
    .eq('destination', destination)
    .is('consumed_at', null)

  const code = generateCode()
  const { error: insErr } = await adminDb.from('signup_verifications').insert({
    destination,
    channel,
    code_hash: hashCode(code, destination),
    expires_at: new Date(Date.now() + CODE_TTL_MINUTES * 60_000).toISOString(),
  })
  if (insErr) {
    console.error('[verify/request] insert failed', insErr.message)
    return NextResponse.json({ error: 'Could not send a code. Please try again.' }, { status: 500 })
  }

  const result = await deliverCode(channel as Channel, destination, code)
  if (!result.sent) {
    console.error('[verify/request] delivery failed', { channel, reason: result.reason, detail: result.detail })
    return NextResponse.json({ error: 'Could not send the code. Please try again.' }, { status: 502 })
  }

  // The destination is echoed back normalised so the UI can show exactly where the
  // code went ("+2348012345678"), which is also what the user must register with.
  return NextResponse.json({ sent: true, destination, channel, expiresInMinutes: CODE_TTL_MINUTES })
}
