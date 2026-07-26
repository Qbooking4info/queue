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

  // Delete the auth user. users.auth_id is ON DELETE SET NULL, not CASCADE --
  // this orphans the users row (auth_id becomes null) rather than deleting
  // it, which is consistent with the appointments just cancelled above
  // referencing a profile that still exists.
  const { error } = await adminDb.auth.admin.deleteUser(user.id)
  if (error) {
    console.error('[DELETE /api/account]', error.message)
    return NextResponse.json({ error: 'Could not delete account' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
