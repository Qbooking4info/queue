import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getServerUser } from '@/lib/supabase/auth-server'
import { Errors } from '@/lib/api-error'
import { RtcTokenBuilder, RtcRole } from 'agora-token'
import { AUTH_CORS_HEADERS, corsOptions } from '@/lib/cors'
import { notifyIncomingCall } from '@/lib/notify-patient'

// Doctor-initiated: POST with { appointmentId }
// Generates host + guest tokens, upserts virtual_sessions, sets appointment to in_progress.
// Patient reads guest_token directly from virtual_sessions via Supabase (RLS allows it).
//
// Called cross-origin by the doctors/mobile apps -- needs real CORS handling
// (preflight OPTIONS + headers on every response), not just the
// Allow-Origin-only pattern used by unauthenticated public routes.
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

  const { appointmentId } = await req.json()
  if (!appointmentId) return Errors.validation('appointmentId is required')

  const db = createAdminClient()

  const { data: appt } = await db
    .from('appointments')
    .select('id, type, status, doctor_id, doctor_user_id, patient_id')
    .eq('id', appointmentId)
    .single()

  if (!appt) return Errors.notFound('Appointment')
  if (appt.type !== 'virtual') return Errors.validation('This appointment is not a virtual consultation')
  // BM1: only confirmed/checked_in/in_progress appointments may start a virtual session;
  // pending, no_show, cancelled, and completed are all invalid for a new token.
  if (!['confirmed', 'checked_in', 'in_progress'].includes(appt.status)) {
    return Errors.validation(`Appointment status '${appt.status}' does not permit a virtual session`)
  }

  // Verify caller is the doctor for this appointment. A direct (hospital-less)
  // booking has no `doctors` row to check at all -- doctor_user_id points
  // straight at the doctor's own users.id instead (see
  // 20260817000001_direct_doctor_booking.sql).
  let callerIsDoctor = false
  if (appt.doctor_user_id) {
    const { data: docUser } = await db.from('users').select('auth_id').eq('id', appt.doctor_user_id).single()
    callerIsDoctor = docUser?.auth_id === user.id
  } else {
    const { data: doctor } = await db
      .from('doctors')
      .select('id, auth_user_id, user_id')
      .eq('id', appt.doctor_id ?? '')
      .maybeSingle() as { data: { id: string; auth_user_id: string | null; user_id: string | null } | null }

    callerIsDoctor = doctor?.auth_user_id === user.id
    if (!callerIsDoctor && doctor?.user_id) {
      const { data: docUser } = await db.from('users').select('auth_id').eq('id', doctor.user_id).single()
      callerIsDoctor = docUser?.auth_id === user.id
    }
  }

  if (!callerIsDoctor) return Errors.forbidden('Only the assigned doctor can start this call')

  // These were previously read with `!`, which is erased at compile time -- a missing
  // value became `undefined`, RtcTokenBuilder happily built a token against an empty
  // app id, and the call simply never connected. That failed silently in production
  // for as long as the vars were absent from Vercel while working locally off
  // .env.local. Fail loudly instead: a misconfigured deploy should be obvious.
  const appId   = process.env.AGORA_APP_ID
  const appCert = process.env.AGORA_APP_CERTIFICATE
  if (!appId || !appCert) {
    const missing = [
      !appId && 'AGORA_APP_ID',
      !appCert && 'AGORA_APP_CERTIFICATE',
    ].filter(Boolean).join(', ')
    console.error(`[virtual/token] refusing to build a token: missing ${missing}`)
    return Errors.internal('Video calling is not configured on this server')
  }
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

  // Move appointment to in_progress and record start time for duration tracking
  await db.from('appointments')
    .update({ status: 'in_progress', consult_started_at: now })
    .eq('id', appointmentId)
    .in('status', ['pending', 'confirmed', 'checked_in'])

  // Ring the patient. Awaited rather than fire-and-forget: on serverless the
  // function can be frozen the moment the response is returned, which would drop
  // an un-awaited push often enough to look like flaky delivery. notifyIncomingCall
  // swallows its own errors, so this cannot stop the doctor starting the call.
  const { data: caller } = await db
    .from('users')
    .select('full_name')
    .eq('auth_id', user.id)
    .single()
  const doctorName = (caller as { full_name?: string } | null)?.full_name
  await notifyIncomingCall(db, appointmentId, doctorName ? `Dr. ${doctorName}` : 'Your doctor')

  return NextResponse.json({
    token:       hostToken,
    channelName,
    uid:         1,
    // Always the exact value the token above was signed with -- NOT
    // NEXT_PUBLIC_AGORA_APP_ID, which could silently diverge from AGORA_APP_ID
    // (different env var, easy to set once and forget). If the client
    // connects with an appId other than the one the token was signed for,
    // Agora's join fails with no error surfaced client-side: the call just
    // sits on "waiting for the other party" forever, since onJoinChannelSuccess
    // never fires and no onError callback fires either. Returning the real
    // signing appId here makes that entire class of bug impossible.
    appId,
  })
}
