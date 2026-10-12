import { NextRequest, NextResponse } from 'next/server'
import { getServerUser } from '@/lib/supabase/auth-server'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit } from '@/lib/rate-limit'

const adminDb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// DELETE /api/account — patient requests own account deletion
export async function DELETE(req: NextRequest) {
  const user = await getServerUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  const rlAllowed = await checkRateLimit(adminDb, `account-delete:${user.id}`, 3, 3600)
  if (!rlAllowed) {
    return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 403 })
  }

  // user.id is the auth UID; appointments.patient_id is a FK to users.id,
  // a different value. Resolve the profile row first -- every RLS policy
  // in this codebase does the same lookup for the same reason.
  const { data: profile } = await adminDb
    .from('users')
    .select('id')
    .eq('auth_id', user.id)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  // Cancel all pending/confirmed appointments before deleting
  const { error: cancelErr } = await adminDb
    .from('appointments')
    .update({
      status: 'cancelled',
      cancellation_reason: 'Account deleted by patient',
      cancelled_at: new Date().toISOString(),
    })
    .eq('patient_id', profile.id)
    .in('status', ['pending', 'confirmed', 'checked_in'])

  // Do not delete the auth user if cancellation failed -- orphaned
  // confirmed appointments are worse than a failed deletion the patient
  // can retry.
  if (cancelErr) {
    console.error('[DELETE /api/account] cancel failed', cancelErr.message)
    return NextResponse.json({ error: 'Could not delete account' }, { status: 500 })
  }

  // Strip identity BEFORE removing the login, not after. If the auth delete
  // succeeded and this failed, the user could no longer sign in to retry and their
  // name, phone and date of birth would sit in the database indefinitely with
  // nobody able to reach them -- the exact state "delete my account" is meant to
  // end. Doing it in this order means a failure here leaves the account intact and
  // retryable.
  const { error: anonErr } = await adminDb.rpc('anonymize_user', { p_user_id: profile.id })
  if (anonErr) {
    console.error('[DELETE /api/account] anonymise failed', anonErr.message)
    return NextResponse.json({ error: 'Could not delete account' }, { status: 500 })
  }

  // Now remove the login. users.auth_id is ON DELETE SET NULL, not CASCADE, so the
  // (now anonymous) profile row survives to keep the clinical records it owns
  // referentially intact -- a hospital must retain those, and they are no longer
  // attributable to a named person.
  const { error } = await adminDb.auth.admin.deleteUser(user.id)
  if (error) {
    console.error('[DELETE /api/account]', error.message)
    // Identity is already gone, which is the part that matters for the erasure
    // request; say so rather than reporting a clean failure the user would retry.
    return NextResponse.json(
      { error: 'Your data was removed but the login could not be closed. Please contact support.' },
      { status: 500 },
    )
  }

  return NextResponse.json({ success: true, anonymised: true })
}
