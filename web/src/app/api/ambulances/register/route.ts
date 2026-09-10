import { getServerUser } from '@/lib/supabase/auth-server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { Errors } from '@/lib/api-error'
import { checkRateLimit } from '@/lib/rate-limit'
import { AUTH_CORS_HEADERS, corsOptions } from '@/lib/cors'

/**
 * POST /api/ambulances/register
 *
 * The one registration path for every ambulance provider -- "independent and
 * hospital owned ambulances ... have the same registration process". Turns a
 * freshly signed-up auth account into an ambulance_providers row (either
 * provider_type='hospital_fleet', linked to an existing hospital, or
 * 'third_party' with a private/government ownership category) plus an
 * ambulance_provider_admins row ('owner') for the caller. A hospital-owned
 * fleet is no longer created through the hospital's own hospital_admins
 * login (the old POST /api/ambulances/fleet) -- ambulance management lives
 * in the Ambulance app only, on its own account, same as an independent
 * operator.
 *
 * Mirrors POST /api/onboarding's shape: account creation already happened
 * client-side (supabase.auth.signUp, with pendingAmbulanceProviderOnboarding
 * set beforehand the same way hospital registration sets
 * pendingHospitalOnboarding), this route only attaches the operator identity
 * to the now-authenticated session. Not gated by requireRole: the whole
 * point is bootstrapping a role that doesn't exist yet, so this uses
 * getServerUser like onboarding does.
 */
export async function OPTIONS() {
  return corsOptions()
}

export async function POST(req: NextRequest) {
  const res = await handlePOST(req)
  for (const [k, v] of Object.entries(AUTH_CORS_HEADERS)) res.headers.set(k, v)
  return res
}

const VALID_PROVIDER_TYPES = ['hospital_fleet', 'third_party']
const VALID_OWNERSHIP = ['private', 'government']

async function handlePOST(req: NextRequest) {
  try {
    const user = await getServerUser(req)
    if (!user) return Errors.unauthenticated()

    const db = createAdminClient()

    // 5 registration attempts per user per hour -- same limit as onboarding.
    const allowed = await checkRateLimit(db, `ambulance-register:${user.id}`, 5, 3600)
    if (!allowed) return Errors.forbidden('Too many registration attempts. Please wait before trying again.')

    const body = await req.json()
    const { providerName, providerType, hospitalId, ownershipCategory, contactPhone, contactEmail } = body

    if (!providerName?.trim()) return Errors.validation('providerName is required')
    if (!VALID_PROVIDER_TYPES.includes(providerType)) return Errors.validation('providerType must be hospital_fleet or third_party')
    if (!contactPhone?.trim()) return Errors.validation('contactPhone is required')

    let resolvedHospitalId: string | null = null
    let resolvedOwnership: string | null = null

    if (providerType === 'hospital_fleet') {
      if (!hospitalId) return Errors.validation('hospitalId is required for a hospital-owned fleet')
      const { data: hospital } = await db.from('hospitals').select('id').eq('id', hospitalId).maybeSingle()
      if (!hospital) return Errors.validation('That hospital could not be found')

      // One ambulance service per hospital -- same guard the old hospital-only
      // creation route enforced.
      const { data: existing } = await db.from('ambulance_providers')
        .select('id').eq('hospital_id', hospitalId).eq('provider_type', 'hospital_fleet').maybeSingle()
      if (existing) return Errors.validation('This hospital already has a registered ambulance service.')

      resolvedHospitalId = hospitalId
    } else {
      if (!VALID_OWNERSHIP.includes(ownershipCategory)) return Errors.validation('ownershipCategory must be private or government')
      resolvedOwnership = ownershipCategory
    }

    // Ensure public profile row exists (same pattern as onboarding -- signUp's
    // own `users` insert may not have run yet, or may have failed silently).
    let { data: profile } = await db.from('users').select('id').eq('auth_id', user.id).single()
    if (!profile) {
      const { data: np, error: pErr } = await db
        .from('users')
        .insert({ auth_id: user.id, full_name: user.user_metadata?.full_name ?? 'Operator', email: user.email ?? '' } as never)
        .select('id').single()
      if (pErr) return Errors.internal(pErr.message)
      profile = np
    }

    // One operator account per person -- same "each user can only own one
    // hospital" guard onboarding applies, for the same reason (prevents a
    // half-finished or repeated registration from stacking providers no one
    // asked for).
    const { data: existingAdmin } = await db
      .from('ambulance_provider_admins')
      .select('id')
      .eq('user_id', profile!.id)
      .limit(1)
      .maybeSingle()
    if (existingAdmin) {
      return Errors.forbidden('Your account is already registered as an ambulance operator.')
    }

    const { data: provider, error: pErr } = await db.from('ambulance_providers').insert({
      name: providerName.trim(),
      provider_type: providerType,
      hospital_id: resolvedHospitalId,
      ownership_category: resolvedOwnership,
      contact_phone: contactPhone.trim(),
      contact_email: contactEmail?.trim() || null,
      is_active: true,
    }).select('id, name').single()

    if (pErr) return Errors.internal(pErr.message)

    const { error: adminErr } = await db.from('ambulance_provider_admins').insert({
      provider_id: provider.id,
      user_id: profile!.id,
      role: 'owner',
    })
    if (adminErr) {
      // Roll back the orphaned provider row rather than leaving a fleet with no admin.
      await db.from('ambulance_providers').delete().eq('id', provider.id)
      return Errors.internal(adminErr.message)
    }

    return NextResponse.json({ success: true, providerId: provider.id }, { status: 201 })
  } catch (e: unknown) {
    return Errors.internal(e instanceof Error ? e.message : String(e))
  }
}
