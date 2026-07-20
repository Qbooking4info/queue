import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { Errors } from '@/lib/api-error'

// DELETE all unbooked future slots for a doctor.
// Separated from the main schedule endpoint because it is destructive.
// Requires hospital_admin with role "admin" or "owner" — clinic_admin cannot clear.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return Errors.unauthenticated()

  const db = createAdminClient()

  const { data: profile } = await db.from('users').select('id').eq('auth_id', user.id).single()
  if (!profile) return Errors.forbidden('Profile not found')

  const { data: adminRecord } = await db
    .from('hospital_admins').select('hospital_id, role')
    .eq('user_id', profile.id).single()
  if (!adminRecord || (adminRecord.role !== 'admin' && adminRecord.role !== 'owner')) {
    return Errors.forbidden('Only hospital admins with the admin or owner role can clear schedules')
  }

  const { doctor_id } = await req.json()
  if (!doctor_id) return Errors.validation('doctor_id is required')

  // Verify doctor belongs to this hospital
  const { data: doctor } = await db.from('doctors')
    .select('id')
    .eq('id', doctor_id)
    .eq('hospital_id', adminRecord.hospital_id)
    .single()
  if (!doctor) return Errors.notFound('Doctor')

  const today = new Date().toISOString().split('T')[0]

  const { error, count } = await db.from('time_slots')
    .delete({ count: 'exact' })
    .eq('doctor_id', doctor_id)
    .gte('slot_date', today)
    .eq('booked_count', 0)

  if (error) return Errors.internal(error.message)

  // Log the destructive action for audit trail
  await (db as any).from('admin_audit_log').insert({
    actor_auth_id: user.id,
    actor_role:    adminRecord.role,
    action:        'clear_doctor_schedule',
    target_table:  'time_slots',
    target_id:     doctor_id,
    new_value:     { deleted_count: count, from_date: today },
  })

  return NextResponse.json({ success: true, deleted: count })
}
