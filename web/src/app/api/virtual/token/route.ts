import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getServerUser } from '@/lib/supabase/auth-server'
import { Errors } from '@/lib/api-error'
import { RtcTokenBuilder, RtcRole } from 'agora-token'

// Doctor-initiated: POST with { appointmentId }
// Generates host + guest tokens, upserts virtual_sessions, sets appointment to in_progress.
// Patient reads guest_token directly from virtual_sessions via Supabase (RLS allows it).
export async function POST(req: NextRequest) {
  const user = await getServerUser()
  if (!user) return Errors.unauthenticated()

  const { appointmentId } = await req.json()
  if (!appointmentId) return Errors.validation('appointmentId is required')

  const db = createAdminClient()

  const { data: appt } = await db
    .from('appointments')
    .select('id, type, status, doctor_id, patient_id')
    .eq('id', appointmentId)
    .single()

  if (!appt) return Errors.notFound('Appointment')
  if (appt.type !== 'virtual') return Errors.validation('This appointment is not a virtual consultation')
  // BM1: only confirmed/checked_in/in_progress appointments may start a virtual session;
  // pending, no_show, cancelled, and completed are all invalid for a new token.
  if (!['confirmed', 'checked_in', 'in_progress'].includes(appt.status)) {
    return Errors.validation(`Appointment status '${appt.status}' does not permit a virtual session`)
  }

  // Verify caller is the doctor for this appointment
  const { data: doctor } = await db
    .from('doctors')
    .select('id, auth_user_id, user_id')
    .eq('id', appt.doctor_id ?? '')
    .maybeSingle() as { data: { id: string; auth_user_id: string | null; user_id: string | null } | null }

  let callerIsDoctor = doctor?.auth_user_id === user.id
  if (!callerIsDoctor && doctor?.user_id) {
    const { data: docUser } = await db.from('users').select('auth_id').eq('id', doctor.user_id).single()
    callerIsDoctor = docUser?.auth_id === user.id
  }

  if (!callerIsDoctor) return Errors.forbidden('Only the assigned doctor can start this call')

  const appId   = process.env.AGORA_APP_ID!
  const appCert = process.env.AGORA_APP_CERTIFICATE!
  const channelName = appointmentId   // UUID is a valid Agora channel name
  const expireSecs  = 7200            // 2 hours

  const hostToken = RtcTokenBuilder.buildTokenWithUid(
    appId, appCert, channelName, 1, RtcRole.PUBLISHER, expireSecs, expireSecs,
  )
  const guestToken = RtcTokenBuilder.buildTokenWithUid(
    appId, appCert, channelName, 2, RtcRole.PUBLISHER, expireSecs, expireSecs,
  )

  const now = new Date().toISOString()

  // Upsert session — host_token + guest_token generated together so patient
  // can read guest_token directly from DB without calling this endpoint
  const { error: sessionErr } = await db.from('virtual_sessions').upsert({
    appointment_id: appointmentId,
    room_name:      channelName,
    status:         'active',
    started_at:     now,
    host_token:     hostToken,
    guest_token:    guestToken,
  }, { onConflict: 'appointment_id' })

  if (sessionErr) return Errors.internal(sessionErr.message)

  // Move appointment to in_progress
  await db.from('appointments')
    .update({ status: 'in_progress' })
    .eq('id', appointmentId)
    .in('status', ['pending', 'confirmed', 'checked_in'])

  return NextResponse.json({
    token:       hostToken,
    channelName,
    uid:         1,
    appId:       process.env.NEXT_PUBLIC_AGORA_APP_ID ?? appId,
  })
}
