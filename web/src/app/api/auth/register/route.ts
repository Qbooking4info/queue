import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AUTH_CORS_HEADERS, corsOptions } from '@/lib/cors'
import { normaliseDestination } from '@/lib/verification'
import { POLICY_VERSION, CONSENT_KIND } from '@/lib/privacy'
import type { Channel } from '@/lib/otp-delivery'

/**
 * POST /api/auth/register — create a patient account, but only against a spent
 * verification claim.
 *
 * Registration moved server-side for exactly one reason: supabase.auth.signUp()
 * runs with the anon key, so any check the app performs before calling it can be
 * skipped by calling Supabase directly. The only way "verified before registering"
 * can mean anything is if the thing that creates the account is the thing that
 * checks, and it lives somewhere the client cannot reach around.
 */


export async function OPTIONS() {
  return corsOptions()
}

export async function POST(req: NextRequest) {
  const res = await handle(req)
  for (const [k, v] of Object.entries(AUTH_CORS_HEADERS)) res.headers.set(k, v)
  return res
}

interface Body {
  claimToken?: string
  email?: string
  password?: string
  fullName?: string
  phone?: string
  dateOfBirth?: string
  registeredVia?: string
}

async function handle(req: NextRequest) {
  // Built per request, not at module scope. A module-scope client is
  // evaluated while Next collects page data at build time, where
  // SUPABASE_SERVICE_ROLE_KEY is absent, and createClient throws
  // 'supabaseKey is required' -- which failed the whole deployment
  // rather than this one route.
  const adminDb = createAdminClient()

  const b = (await req.json().catch(() => ({}))) as Body

  const claimToken = (b.claimToken ?? '').trim()
  const email = (b.email ?? '').trim().toLowerCase()
  const password = b.password ?? ''
  const fullName = (b.fullName ?? '').trim()
  const phone = (b.phone ?? '').trim()

  if (!claimToken) return NextResponse.json({ error: 'Verification required.' }, { status: 400 })
  if (!email || !password || !fullName) {
    return NextResponse.json({ error: 'Name, email and password are required.' }, { status: 400 })
  }
  if (password.length < 6) {
    return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 })
  }

  // Spend the claim. Conditioned on consumed_at being null so two concurrent
  // submissions of the same token cannot both create an account; the loser sees
  // no rows updated and is rejected.
  const { data: claim, error: claimErr } = await adminDb
    .from('signup_verifications')
    .update({ consumed_at: new Date().toISOString() })
    .eq('claim_token', claimToken)
    .is('consumed_at', null)
    .not('verified_at', 'is', null)
    .select('destination, channel, verified_at')
    .maybeSingle()

  if (claimErr || !claim) {
    return NextResponse.json({ error: 'Verification expired or already used. Please verify again.' }, { status: 400 })
  }

  // A verified destination must be one of the details actually being registered.
  // Without this, someone could verify their own phone and then register under
  // somebody else's email — the check would pass and prove nothing.
  if (claim.channel === 'email') {
    if (claim.destination !== email) {
      return NextResponse.json({ error: 'Register with the email address you verified.' }, { status: 400 })
    }
  } else {
    const normPhone = normaliseDestination('sms' as Channel, phone)
    if (!normPhone.ok || normPhone.value !== claim.destination) {
      return NextResponse.json({ error: 'Register with the phone number you verified.' }, { status: 400 })
    }
  }

  // email_confirm: the address (or the phone) has already been proved by the code
  // just spent, so a second confirmation email would be asking twice.
  const { data: created, error: authErr } = await adminDb.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      ...(b.registeredVia ? { registered_via: b.registeredVia } : {}),
      verified_channel: claim.channel,
    },
  })

  if (authErr || !created?.user) {
    const msg = authErr?.message ?? 'Could not create the account.'
    // Supabase reports an existing address plainly; pass that through since the
    // person is registering and needs to know, but keep everything else generic.
    const duplicate = /already registered|already been registered|duplicate/i.test(msg)
    return NextResponse.json(
      { error: duplicate ? 'An account with that email already exists. Please sign in.' : 'Could not create the account.' },
      { status: duplicate ? 409 : 500 },
    )
  }

  const normPhone = phone ? normaliseDestination('sms' as Channel, phone) : null
  const { data: profile, error: profErr } = await adminDb.from('users').insert({
    auth_id: created.user.id,
    email,
    full_name: fullName,
    // Store the normalised form so the number on file matches the one verified.
    phone: normPhone?.ok ? normPhone.value : (phone || null),
    date_of_birth: b.dateOfBirth || null,
  }).select('id').single()

  if (profErr || !profile) {
    // Roll the auth user back. Leaving it stranded produced a real incident before
    // (an auth account with no users row, unusable and stuck signed in with a null
    // profile) -- and unlike the old client-side path, here we can actually undo it.
    await adminDb.auth.admin.deleteUser(created.user.id).catch(() => {})
    console.error('[auth/register] profile insert failed', profErr?.message)
    return NextResponse.json({ error: 'Could not create the account. Please try again.' }, { status: 500 })
  }

  // Consent recorded server-side, where it cannot be skipped by a client that
  // simply does not send it.
  const { error: consentErr } = await adminDb.from('user_consents').insert([
    { user_id: profile.id, kind: CONSENT_KIND.privacy, policy_version: POLICY_VERSION, source: 'signup' },
    { user_id: profile.id, kind: CONSENT_KIND.terms, policy_version: POLICY_VERSION, source: 'signup' },
  ])
  if (consentErr) console.warn('[auth/register] consent not recorded:', consentErr.message)

  // No session is returned. The client signs in with the password it just set,
  // which keeps the session entirely in Supabase's hands rather than this route
  // minting one.
  return NextResponse.json({ created: true, email })
}
