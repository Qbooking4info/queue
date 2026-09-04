import { createAdminClient } from '@/lib/supabase/admin'
import { getServerUser } from '@/lib/supabase/auth-server'
import { NextRequest, NextResponse } from 'next/server'
import { Errors } from '@/lib/api-error'
import { todayLocalDate } from '@/lib/dashboard-utils'
import { AUTH_CORS_HEADERS, corsOptions } from '@/lib/cors'

// Called cross-origin by the Queue Hospital app running in a browser
// (localhost:8096 -> localhost:3000) -- needs real CORS handling (preflight
// OPTIONS + headers on every response), same as virtual/token and onboarding.
export async function OPTIONS() {
  return corsOptions()
}

// DELETE all unbooked future slots for a doctor.
// Separated from the main schedule endpoint because it is destructive.
// Requires hospital_admin with role "admin" or "owner" — clinic_admin cannot clear.
export async function POST(req: NextRequest) {
  const res = await handlePOST(req)
  for (const [k, v] of Object.entries(AUTH_CORS_HEADERS)) res.headers.set(k, v)
  return res
}

async function handlePOST(req: NextRequest) {
  // getServerUser checks Authorization: Bearer first, falls back to the SSR
  // cookie session -- the cookie-only createClient() check this replaced would
  // silently 401 any cross-origin Bearer-token caller (the mobile app) even
  // once CORS is fixed, since no cookie is ever sent cross-origin.
  const user = await getServerUser(req)
  if (!user) return Errors.unauthenticated()

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

  const today = todayLocalDate()

  const { error, count } = await db.from('time_slots')
    .delete({ count: 'exact' })
    .eq('doctor_id', doctor_id)
    .gte('slot_date', today)
    .eq('booked_count', 0)

  if (error) return Errors.internal(error.message)

  // Log the destructive action for audit trail
  await db.from('admin_audit_log').insert({
    actor_auth_id: user.id,
    actor_role:    adminRecord.role,
    action:        'clear_doctor_schedule',
    target_table:  'time_slots',
    target_id:     doctor_id,
    new_value:     { deleted_count: count, from_date: today },
  })

  return NextResponse.json({ success: true, deleted: count })
}
