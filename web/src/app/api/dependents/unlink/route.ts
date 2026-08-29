import { createAdminClient } from '@/lib/supabase/admin'
import { getServerUser } from '@/lib/supabase/auth-server'
import { NextRequest, NextResponse } from 'next/server'
import { Errors } from '@/lib/api-error'
import { calcAge } from '@/lib/dashboard-utils'
import { AUTH_CORS_HEADERS, corsOptions } from '@/lib/cors'

// POST /api/dependents/unlink { linkId } -- ends a caretaker/dependent
// relationship. Either side can end it, but a dependent can only self-unlink
// once they're 18+ (a minor doesn't have the legal agency to unilaterally
// sever a caretaker's management); unknown date_of_birth is treated as NOT
// eligible, same safe-default precedent as the clinic age/gender restriction
// feature (block rather than assume). Called cross-origin by the mobile app --
// needs real CORS handling, same as the other /api/dependents routes.
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

  const { linkId } = await req.json().catch(() => ({})) as { linkId?: string }
  if (!linkId) return Errors.validation('linkId is required')

  const { data: link } = await db
    .from('dependent_links')
    .select('id, caretaker_id, dependent_id, status')
    .eq('id', linkId)
    .single()
  if (!link) return Errors.notFound('Link')
  if (link.status !== 'active') return Errors.validation('This link is already unlinked')

  if (caller.id === link.caretaker_id) {
    // Caretaker can always end the relationship.
  } else if (caller.id === link.dependent_id) {
    const { data: self } = await db.from('users').select('date_of_birth').eq('id', caller.id).single()
    const age = calcAge(self?.date_of_birth ?? null)
    if (age === null || age < 18) {
      return Errors.forbidden('You must be 18 or older to unlink your own account. Please complete your date of birth if this is incorrect.')
    }
  } else {
    return Errors.forbidden()
  }

  const { error } = await db.from('dependent_links')
    .update({ status: 'unlinked', unlinked_at: new Date().toISOString(), unlinked_by: caller.id } as never)
    .eq('id', linkId)
  if (error) return Errors.internal(error.message)

  return NextResponse.json({ success: true })
}
