import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/supabase/auth-server'
import { createClient } from '@supabase/supabase-js'

const adminDb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// DELETE /api/account — patient requests own account deletion
export async function DELETE() {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  // Cancel all pending/confirmed appointments before deleting
  await adminDb
    .from('appointments')
    .update({ status: 'cancelled' })
    .eq('patient_id', user.id)
    .in('status', ['pending', 'confirmed', 'checked_in'])

  // Delete the auth user — cascades to users row via DB trigger/FK
  const { error } = await adminDb.auth.admin.deleteUser(user.id)
  if (error) {
    console.error('[DELETE /api/account]', error.message)
    return NextResponse.json({ error: 'Could not delete account' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
