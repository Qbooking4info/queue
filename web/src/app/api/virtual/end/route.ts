import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getServerUser } from '@/lib/supabase/auth-server'
import { Errors } from '@/lib/api-error'
import { AUTH_CORS_HEADERS, corsOptions } from '@/lib/cors'

// POST { appointmentId } — either party may call it, with different effects.
//
// Doctor: ends the consultation. Sets virtual_sessions.ended_at + duration_secs and
// marks the appointment completed (consult_ended_at too, which analytics reads).
// Idempotent: a second call does not stretch the recorded duration.
//
// Patient: leaving is NOT ending. The patient screens call this on every exit,
// including a dropped network and the CallErrorBoundary fallback that tells them to
// rejoin. Completing the appointment there made rejoining impossible (the token
// route refuses 'completed') and the doctor's "Start" failed with no explanation.
// The call stays open for the doctor to finish; a stale in_progress consult is
// still auto-closed when the doctor starts their next one (admin-api startConsultation).
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

  // Verify caller is the doctor. Direct (hospital-less) bookings have no
  // `doctors` row -- doctor_user_id points straight at users.id instead.
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

  let callerIsPatient = false
  if (!callerIsDoctor && appt.patient_id) {
    const { data: patUser } = await db.from('users').select('auth_id').eq('id', appt.patient_id).single()
    callerIsPatient = patUser?.auth_id === user.id
  }

  if (!callerIsDoctor && !callerIsPatient) return Errors.forbidden()

  if (!callerIsDoctor) return NextResponse.json({ success: true, ended: false })

  const now = new Date().toISOString()

  const { data: session } = await db
    .from('virtual_sessions')
    .select('started_at, ended_at')
    .eq('appointment_id', appointmentId)
    .maybeSingle()

  if (session?.ended_at) return NextResponse.json({ success: true, ended: true, durationSecs: null })

  const durationSecs = session?.started_at
    ? Math.round((Date.now() - new Date(session.started_at).getTime()) / 1000)
    : null

  // BM9: write the appointment first (most critical record), then the virtual session.
  // A mid-flight failure leaves the appointment complete with a stale session (recoverable)
  // rather than a completed session with no appointment update (inconsistent).
  await db.from('appointments')
    .update({ status: 'completed', consult_ended_at: now })
    .eq('id', appointmentId)
    .eq('status', 'in_progress')

  await db.from('virtual_sessions').update({
    status:        'ended',
    ended_at:      now,
    duration_secs: durationSecs,
  }).eq('appointment_id', appointmentId).is('ended_at', null)

  return NextResponse.json({ success: true, ended: true, durationSecs })
}
