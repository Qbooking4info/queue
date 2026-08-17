import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { getServerUser } from '@/lib/supabase/auth-server'
import { Errors } from '@/lib/api-error'
import { notifyStaff } from '@/lib/notify-staff'

/**
 * POST /api/appointments/notify-staff   { appointmentId }
 *
 * Tells the assigned doctor a booking was made.
 *
 * Previously this had no authentication of any kind while using the service-role
 * client, and took the notification text straight from the request body. That
 * made it an open API for pushing arbitrary text to a named clinician's phone
 * and writing unbounded rows into `notifications`. Two changes close that:
 *   1. The caller must be signed in and must be the patient on the appointment
 *      (or staff at the hospital it belongs to) -- an authenticated stranger
 *      still can't trigger a notification about someone else's booking.
 *   2. notifyStaff() composes the patient/hospital names itself from the
 *      appointment record, not from anything the caller sends -- see
 *      lib/notify-staff.ts.
 */
export async function POST(req: NextRequest) {
  const user = await getServerUser(req)
  if (!user) return Errors.unauthenticated()

  const { appointmentId } = await req.json().catch(() => ({})) as { appointmentId?: string }
  if (!appointmentId) return Errors.validation('appointmentId is required')

  const db = createAdminClient()

  const { data: profile } = await db.from('users').select('id, full_name').eq('auth_id', user.id).single()
  if (!profile) return Errors.notFound('User')

  const { data: appt } = await db
    .from('appointments')
    .select('id, patient_id, hospital_id')
    .eq('id', appointmentId)
    .single()
  if (!appt) return Errors.notFound('Appointment')

  const a = appt as unknown as { patient_id: string | null; hospital_id: string | null }

  // The patient who booked it, or staff at that hospital. Anyone else has no
  // business triggering a notification about this appointment. Direct
  // (hospital-less) bookings never reach this route at all -- notify-staff
  // is only called from the hospital-mediated booking flow -- but the
  // hospital_id-null guard keeps this safe either way.
  let allowed = a.patient_id === profile.id
  if (!allowed && a.hospital_id) {
    const [{ data: ha }, { data: ca }] = await Promise.all([
      db.from('hospital_admins').select('id').eq('user_id', profile.id)
        .eq('hospital_id', a.hospital_id).eq('is_active', true).maybeSingle(),
      db.from('clinic_admins').select('id').eq('user_id', profile.id)
        .eq('hospital_id', a.hospital_id).eq('is_active', true).maybeSingle(),
    ])
    allowed = !!ha || !!ca
  }
  if (!allowed) return Errors.forbidden('Not your appointment')

  await notifyStaff(db, appointmentId)

  return NextResponse.json({ ok: true })
}
