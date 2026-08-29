import { createAdminClient } from '@/lib/supabase/admin'
import { getServerUser } from '@/lib/supabase/auth-server'
import { NextRequest, NextResponse } from 'next/server'
import { Errors } from '@/lib/api-error'
import { checkRateLimit } from '@/lib/rate-limit'
import { AUTH_CORS_HEADERS, corsOptions } from '@/lib/cors'

// POST /api/dependents/link -- links a caretaker's account to another real,
// independently-registered patient account (the dependent), given the
// dependent's own short Patient ID (users.patient_code -- see
// 20260827000001_dependent_account_linking.sql, mirrors doctor_code but kept
// as a separate column/concept). Unlike doctor-linking this is patient-authed
// (getServerUser, any logged-in patient), not requireRole -- there's no staff
// role involved on either side.
//
// GET ?code=XXXXXX -- lookup step so the caretaker can confirm whose account
// they're about to link before choosing the relationship, same two-step shape
// as /api/doctors/link. Called cross-origin by the mobile app -- needs real
// CORS handling (see /api/dependents/linked/route.ts for what omitting this
// actually looked like: every fetch() failing silently, screen stuck loading).
export async function OPTIONS() {
  return corsOptions()
}

export async function GET(req: NextRequest) {
  const res = await handleGET(req)
  for (const [k, v] of Object.entries(AUTH_CORS_HEADERS)) res.headers.set(k, v)
  return res
}

async function handleGET(req: NextRequest) {
  const user = await getServerUser(req)
  if (!user) return Errors.unauthenticated()

  const url = new URL(req.url)
  const code = url.searchParams.get('code')?.trim().toUpperCase()
  if (!code) return Errors.validation('code is required')
  // 'caretaker' (default): caller is looking up a prospective DEPENDENT by the
  // dependent's own code. 'dependent': caller is looking up a prospective
  // CARETAKER by the caretaker's code (self-service linking, e.g. at signup).
  const as = url.searchParams.get('as') === 'dependent' ? 'dependent' : 'caretaker'

  const db = createAdminClient()
  const { data: caller } = await db.from('users').select('id').eq('auth_id', user.id).single()
  if (!caller) return Errors.notFound('User')

  const { data: account } = await db
    .from('users')
    .select('id, full_name, date_of_birth')
    .eq('patient_code', code)
    .single()
  if (!account) return Errors.notFound('No account found with that Patient ID')
  if (account.id === caller.id) return Errors.validation('You cannot link your own account')

  // The unique-active-dependent index only ever cares about the DEPENDENT side of
  // the pair -- when as=dependent that's the caller, not the looked-up account.
  const { data: existingLink } = await db
    .from('dependent_links')
    .select('id')
    .eq('dependent_id', as === 'dependent' ? caller.id : account.id)
    .eq('status', 'active')
    .maybeSingle()

  return NextResponse.json({
    fullName: account.full_name,
    dateOfBirth: account.date_of_birth,
    alreadyLinked: !!existingLink,
  })
}

export async function POST(req: NextRequest) {
  const res = await handlePOST(req)
  for (const [k, v] of Object.entries(AUTH_CORS_HEADERS)) res.headers.set(k, v)
  return res
}

async function handlePOST(req: NextRequest) {
  const user = await getServerUser(req)
  if (!user) return Errors.unauthenticated()

  const db = createAdminClient()
  const { data: caller } = await db.from('users').select('id').eq('auth_id', user.id).single()
  if (!caller) return Errors.notFound('User')

  const { code, relationship, as } = await req.json().catch(() => ({})) as { code?: string; relationship?: string; as?: string }
  if (!code?.trim()) return Errors.validation('code is required')
  const RELATIONSHIPS = ['spouse', 'child', 'parent', 'sibling', 'other']
  if (!relationship || !RELATIONSHIPS.includes(relationship)) {
    return Errors.validation(`relationship must be one of: ${RELATIONSHIPS.join(', ')}`)
  }
  // 'caretaker' (default): caller becomes the caretaker of the looked-up account
  // (the original flow). 'dependent': caller becomes the dependent of the
  // looked-up account instead -- self-service linking, e.g. right after signup.
  const asDependent = as === 'dependent'

  const { data: account } = await db.from('users').select('id, full_name').eq('patient_code', code.trim().toUpperCase()).single()
  if (!account) return Errors.notFound('No account found with that Patient ID')
  if (account.id === caller.id) return Errors.validation('You cannot link your own account')

  const rlAllowed = await checkRateLimit(db, `dependents-link:${caller.id}`, 20, 3600)
  if (!rlAllowed) return Errors.forbidden('Too many link attempts. Please try again later.')

  const caretakerId = asDependent ? account.id : caller.id
  const dependentId = asDependent ? caller.id : account.id

  // The unique partial index on dependent_links(dependent_id) WHERE status='active'
  // is the hard backstop; this check just gives a clean error instead of a raw
  // constraint violation in the common case.
  const { data: existingLink } = await db
    .from('dependent_links')
    .select('id')
    .eq('dependent_id', dependentId)
    .eq('status', 'active')
    .maybeSingle()
  if (existingLink) return Errors.validation('This account is already linked to a caretaker')

  const { data, error } = await db
    .from('dependent_links')
    .insert({ caretaker_id: caretakerId, dependent_id: dependentId, relationship } as never)
    .select('id')
    .single()

  if (error) {
    // Race: someone else's link landed between the check above and this insert.
    if (error.code === '23505') return Errors.validation('This account is already linked to a caretaker')
    return Errors.internal(error.message)
  }

  return NextResponse.json({ id: data.id, fullName: account.full_name })
}
