import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole } from '@/lib/supabase/auth-server'
import { resolveProviderId } from '@/lib/ambulance-fleet'
import { Errors } from '@/lib/api-error'
import { AUTH_CORS_HEADERS, corsOptions } from '@/lib/cors'

const VALID_CREW_ROLES = ['driver', 'emt', 'paramedic', 'nurse', 'doctor', 'dispatcher']
const VALID_CREW_TIERS = ['PTS', 'BLS', 'ALS', 'CCT']
const PASSWORD_CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'

function genPassword() {
  return Array.from(crypto.getRandomValues(new Uint8Array(12)))
    .map((b: number) => PASSWORD_CHARSET[b % PASSWORD_CHARSET.length]).join('')
}

export async function OPTIONS() {
  return corsOptions()
}

/** This fleet's crew, for the shift-assignment picker. */
export async function GET(req: NextRequest) {
  const res = await handleGET(req)
  for (const [k, v] of Object.entries(AUTH_CORS_HEADERS)) res.headers.set(k, v)
  return res
}

async function handleGET(req: NextRequest) {
  const auth = await requireRole(['ambulance_admin'], req)
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  const db = createAdminClient()

  const providerId = await resolveProviderId(caller, db)
  if (!providerId) return NextResponse.json({ crew: [] })
  const { data } = await db.from('ambulance_crew')
    .select('id, crew_role, crew_tier, users(full_name)')
    .eq('provider_id', providerId)
    .eq('is_active', true)
    .order('created_at')
  return NextResponse.json({ crew: data ?? [] })
}

/**
 * Add a crew member. Auto-generated portal credentials (crew members
 * typically have no work email to invite), same pattern the web dashboard's
 * addCrewMember server action already uses for hospital staff -- exposed as
 * an HTTP route here since the Ambulance app has no access to Next.js server
 * actions, and since every provider's crew (hospital-owned or independent)
 * lives in ambulance_crew now, not hospital_admins.
 */
export async function POST(req: NextRequest) {
  const res = await handlePOST(req)
  for (const [k, v] of Object.entries(AUTH_CORS_HEADERS)) res.headers.set(k, v)
  return res
}

async function handlePOST(req: NextRequest) {
  const auth = await requireRole(['ambulance_admin'], req)
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  const db = createAdminClient()

  const providerId = await resolveProviderId(caller, db)
  if (!providerId) return Errors.forbidden()

  const body = await req.json().catch(() => null) as { fullName?: string; crewRole?: string; crewTier?: string } | null
  const fullName = body?.fullName?.trim() ?? ''
  const crewRole = body?.crewRole?.trim() ?? ''
  const crewTier = body?.crewTier?.trim() ?? ''

  if (!fullName) return Errors.validation('fullName is required')
  if (!VALID_CREW_ROLES.includes(crewRole)) return Errors.validation('Invalid crewRole')
  if (!VALID_CREW_TIERS.includes(crewTier)) return Errors.validation('Invalid crewTier')

  const nameSlug = fullName.toLowerCase().replace(/[^a-z0-9]+/g, '.')
  const suffix = Array.from(crypto.getRandomValues(new Uint8Array(4)))
    .map((b: number) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('')
  const loginEmail = `crew.${nameSlug}.${suffix}@portal.queueapp.co`
  const newPassword = genPassword()

  const { data: authUser, error: authErr } = await db.auth.admin.createUser({
    email: loginEmail, password: newPassword, email_confirm: true,
  })
  if (authErr || !authUser.user) return Errors.internal(authErr?.message ?? 'Failed to create auth user')

  const { data: profile, error: profileErr } = await db.from('users').insert({
    auth_id: authUser.user.id, email: loginEmail, full_name: fullName,
  } as never).select('id').single()
  if (profileErr || !profile) {
    await db.auth.admin.deleteUser(authUser.user.id)
    return Errors.internal(profileErr?.message ?? 'Failed to create profile')
  }

  const { error } = await db.from('ambulance_crew').insert({
    provider_id: providerId, user_id: profile.id, crew_role: crewRole, crew_tier: crewTier,
  })
  if (error) {
    await db.auth.admin.deleteUser(authUser.user.id)
    return Errors.internal(error.message)
  }

  return NextResponse.json({ email: loginEmail, password: newPassword }, { status: 201 })
}
