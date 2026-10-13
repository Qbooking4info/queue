import { createAdminClient } from '@/lib/supabase/admin'
import { getServerUser } from '@/lib/supabase/auth-server'
import { NextRequest, NextResponse } from 'next/server'
import { Errors } from '@/lib/api-error'
import { checkRateLimit } from '@/lib/rate-limit'
import { AUTH_CORS_HEADERS, corsOptions } from '@/lib/cors'
import { PRIVILEGED_ACCOUNT_MESSAGE, isPrivilegedAccount } from '@/lib/dependent-linking'

// POST /api/dependents/switch { dependentId } -- lets a caretaker's mobile app
// actually sign in as a linked dependent's own account, without ever knowing
// their password. Returns a magic-link token hash generated via the
// admin API's generateLink (NOT inviteUserByEmail -- that sends a real email;
// this hands the token straight back to the caller, nothing is emailed) that
// the client redeems locally with supabase.auth.verifyOtp({ token_hash,
// type: 'magiclink' }). The active dependent_links check below is the entire
// authorization boundary here -- it's what stops this being "sign in as
// anyone" -- so it must run before generateLink is ever called, not after.
export async function OPTIONS() {
  return corsOptions()
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

  const { dependentId } = await req.json().catch(() => ({})) as { dependentId?: string }
  if (!dependentId) return Errors.validation('dependentId is required')

  const { data: link } = await db
    .from('dependent_links')
    .select('id')
    .eq('caretaker_id', caller.id)
    .eq('dependent_id', dependentId)
    .eq('status', 'active')
    .maybeSingle()
  if (!link) return Errors.forbidden('You are not the active caretaker for that account')

  const rlAllowed = await checkRateLimit(db, `dependents-switch:${caller.id}`, 20, 3600)
  if (!rlAllowed) return Errors.forbidden('Too many switch attempts. Please try again later.')

  const { data: dependent } = await db.from('users').select('full_name, auth_id').eq('id', dependentId).single()
  if (!dependent?.auth_id) return Errors.notFound('Dependent account')
  // Never mint a session for a staff/doctor/admin account, whatever links exist.
  if (await isPrivilegedAccount(db, dependentId, dependent.auth_id)) return Errors.forbidden(PRIVILEGED_ACCOUNT_MESSAGE)

  // The magic link must be for the dependent's own AUTH account. public.users.email is
  // a profile copy the account holder can edit; minting the link from it let anyone
  // who controls a linked account set that email to a victim's address and receive a
  // session for the victim.
  const { data: authUser } = await db.auth.admin.getUserById(dependent.auth_id)
  const authEmail = authUser?.user?.email
  if (!authEmail) return Errors.notFound('Dependent account')

  const { data, error } = await db.auth.admin.generateLink({ type: 'magiclink', email: authEmail })
  if (error || !data?.properties?.hashed_token) {
    return Errors.internal(error?.message ?? 'Could not generate a session for that account')
  }
  // Belt and braces: the link must resolve to the same auth user we authorised.
  if (data.user?.id && data.user.id !== dependent.auth_id) {
    console.error('[dependents/switch] magic link resolved to a different user', dependentId)
    return Errors.forbidden('Could not switch to that account')
  }

  return NextResponse.json({ tokenHash: data.properties.hashed_token, fullName: dependent.full_name })
}
