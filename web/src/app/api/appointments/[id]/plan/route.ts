import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getServerUser } from '@/lib/supabase/auth-server'
import { Errors } from '@/lib/api-error'
import { notifyPatient } from '@/lib/notify-patient'
import { AUTH_CORS_HEADERS, corsOptions } from '@/lib/cors'

/**
 * POST /api/appointments/[id]/plan  { diagnosis?, investigations?, treatmentPlan? }
 *
 * The one place a doctor can share structured clinical documentation with a
 * patient in-app: diagnosis, investigations, and treatment, after a VIRTUAL
 * consultation. Applies identically whether the appointment was hospital-linked
 * or booked directly with an independent doctor -- same three fields, same
 * route, both cases. In-person and home-visit visits keep using the existing
 * free-text diagnosis/doctor_notes fields untouched.
 *
 * Uses getServerUser (not requireRole) and the exact dual-path doctor-identity
 * check from POST /api/virtual/end -- a direct booking's doctor has no
 * hospital role for requireRole to resolve, so "is this caller the treating
 * doctor" has to be checked against the appointment row itself, the same way
 * ending the call already does.
 *
 * Called cross-origin by the doctors app -- needs real CORS handling.
 */
export async function OPTIONS() {
  return corsOptions()
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const res = await handlePOST(req, ctx)
  for (const [k, v] of Object.entries(AUTH_CORS_HEADERS)) res.headers.set(k, v)
  return res
}

interface PlanBody {
  diagnosis?: string | null
  investigations?: string | null
  treatmentPlan?: string | null
}

async function handlePOST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getServerUser(req)
  if (!user) return Errors.unauthenticated()

  const { id } = await params
  const db = createAdminClient()

  const { data: appt } = await db
    .from('appointments')
    .select('id, type, doctor_id, doctor_user_id')
    .eq('id', id)
    .single()
  if (!appt) return Errors.notFound('Appointment')

  if (appt.type !== 'virtual') {
    return Errors.validation('Consultation plans are only available for virtual consultations')
  }

  // Verify caller is the treating doctor. Direct (hospital-less) bookings have
  // no `doctors` row -- doctor_user_id points straight at users.id instead.
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
  if (!callerIsDoctor) return Errors.forbidden('Only the treating doctor can share a consultation plan')

  const body = (await req.json().catch(() => null)) as PlanBody | null
  if (!body) return Errors.validation('Request body is required')

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if ('diagnosis' in body) update.diagnosis = body.diagnosis?.trim() || null
  if ('investigations' in body) update.investigations = body.investigations?.trim() || null
  if ('treatmentPlan' in body) update.treatment_plan = body.treatmentPlan?.trim() || null

  const { error } = await db.from('appointments').update(update as never).eq('id', id)
  if (error) return Errors.internal(error.message)

  await notifyPatient(
    db, id, 'consultation_plan', 'Consultation Summary Ready',
    'Your doctor has shared your consultation summary.',
  )

  return NextResponse.json({ success: true })
}
