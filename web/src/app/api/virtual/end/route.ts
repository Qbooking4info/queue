import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getServerUser } from '@/lib/supabase/auth-server'
import { Errors } from '@/lib/api-error'

// POST { appointmentId } — doctor ends the call.
// Sets virtual_sessions.ended_at, calculates duration_secs, marks appointment completed.
export async function POST(req: NextRequest) {
  const user = await getServerUser()
  if (!user) return Errors.unauthenticated()

  const { appointmentId } = await req.json()
  if (!appointmentId) return Errors.validation('appointmentId is required')

  const db = createAdminClient()

  const { data: appt } = await db
    .from('appointments')
    .select('id, doctor_id')
    .eq('id', appointmentId)
    .single()

  if (!appt) return Errors.notFound('Appointment')

  // Verify caller is the doctor
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

  if (!callerIsDoctor) return Errors.forbidden()

  const now = new Date().toISOString()

  const { data: session } = await db
    .from('virtual_sessions')
    .select('started_at')
    .eq('appointment_id', appointmentId)
    .single()

  const durationSecs = session?.started_at
    ? Math.round((Date.now() - new Date(session.started_at).getTime()) / 1000)
    : null

  await db.from('virtual_sessions').update({
    status:        'ended',
    ended_at:      now,
    duration_secs: durationSecs,
  }).eq('appointment_id', appointmentId)

  await db.from('appointments')
    .update({ status: 'completed' })
    .eq('id', appointmentId)
    .eq('status', 'in_progress')

  return NextResponse.json({ success: true, durationSecs })
}
