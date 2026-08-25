import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { requireRole, getServerUser } from '@/lib/supabase/auth-server'
import { Errors } from '@/lib/api-error'
import { AUTH_CORS_HEADERS, corsOptions } from '@/lib/cors'

// A checked-in patient's position within their own doctor's queue is
// reorderable two ways: staff (front desk/admin/the doctor) can move anyone at
// their hospital in either direction, and a patient can voluntarily move
// THEMSELVES later (never earlier -- that would be jumping ahead of others,
// which only staff may authorise). Both paths end up at the same
// move_appointment_in_queue() SQL function (supabase/migrations/
// 20260821000003_queue_manual_reorder_and_alerts.sql) -- this route's only job
// is figuring out which caller it is and enforcing the direction/ownership
// rule that function deliberately doesn't know about.
//
// Called cross-origin by the doctors/mobile apps -- needs real CORS handling.
export async function OPTIONS() {
  return corsOptions()
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const res = await handleGET(req, ctx)
  for (const [k, v] of Object.entries(AUTH_CORS_HEADERS)) res.headers.set(k, v)
  return res
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const res = await handlePOST(req, ctx)
  for (const [k, v] of Object.entries(AUTH_CORS_HEADERS)) res.headers.set(k, v)
  return res
}

const STAFF_ROLES = ['super_admin', 'hospital_admin', 'clinic_admin', 'front_desk', 'doctor'] as const

interface CallerContext { isStaff: boolean }

// Resolves who's calling: staff first (any role in STAFF_ROLES, hospital-scoped
// against the appointment), falling back to the patient themselves. Returns an
// Errors response only if NEITHER path authorises the caller.
async function resolveCaller(
  req: NextRequest,
  appt: { hospital_id: string | null; patient_id: string | null },
): Promise<CallerContext | NextResponse> {
  const staffAuth = await requireRole([...STAFF_ROLES], req)
  if (!(staffAuth instanceof NextResponse)) {
    const { caller } = staffAuth
    if (caller.role !== 'super_admin' && caller.hospitalId !== appt.hospital_id) {
      return Errors.forbidden("Cannot modify another hospital's appointment")
    }
    return { isStaff: true }
  }

  const user = await getServerUser(req)
  if (!user) return Errors.unauthenticated()
  const db = createAdminClient()
  const { data: profile } = await db.from('users').select('id').eq('auth_id', user.id).single()
  if (!profile || profile.id !== appt.patient_id) return Errors.forbidden('Not your appointment')
  return { isStaff: false }
}

async function handleGET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = createAdminClient()

  const { data: appt } = await db
    .from('appointments')
    .select('hospital_id, patient_id, doctor_id, assigned_doctor_id, check_in_date, status, urgency, queue_position, estimated_wait')
    .eq('id', id)
    .single()
  if (!appt || !appt.hospital_id) return Errors.notFound('Appointment')

  const caller = await resolveCaller(req, appt)
  if (caller instanceof NextResponse) return caller

  // in_progress is allowed through too -- the caller just isn't offered a
  // reorder affordance for it (nothing to reorder once you're being seen),
  // but the card still needs to show *something* instead of an error.
  if (!['checked_in', 'in_progress'].includes(appt.status)) {
    return Errors.validation('Appointment is not currently in an active queue')
  }
  const doctorId = appt.doctor_id ?? appt.assigned_doctor_id
  if (!doctorId || !appt.check_in_date) return Errors.validation('Appointment is not in an active queue')

  // Bounds of this appointment's own urgency tier. renumber_doctor_queue's ORDER BY
  // only ever splits the queue into TWO tiers -- (urgency='emergency') DESC --
  // lumping 'routine' and 'urgent' together, so mirror that boolean split here
  // (not a 3-way split by the literal urgency string) to match
  // move_appointment_in_queue()'s own clamp exactly.
  const isEmergency = appt.urgency === 'emergency'
  const doctorFilter = `doctor_id.eq.${doctorId},assigned_doctor_id.eq.${doctorId}`

  const { count: emergencyCount } = await db.from('appointments')
    .select('id', { count: 'exact', head: true })
    .eq('hospital_id', appt.hospital_id).eq('check_in_date', appt.check_in_date)
    .in('status', ['checked_in', 'in_progress'])
    .or(doctorFilter)
    .eq('urgency', 'emergency')
  let tierSizeQuery = db.from('appointments')
    .select('id', { count: 'exact', head: true })
    .eq('hospital_id', appt.hospital_id).eq('check_in_date', appt.check_in_date)
    .in('status', ['checked_in', 'in_progress'])
    .or(doctorFilter)
  tierSizeQuery = isEmergency ? tierSizeQuery.eq('urgency', 'emergency') : tierSizeQuery.neq('urgency', 'emergency')
  const { count: tierSize } = await tierSizeQuery

  const tierOffset = isEmergency ? 0 : (emergencyCount ?? 0)
  const minPosition = tierOffset + 1
  const maxPosition = tierOffset + (tierSize ?? 1)

  return NextResponse.json({
    currentPosition: appt.queue_position, minPosition, maxPosition,
    estimatedWait: appt.estimated_wait, status: appt.status,
  })
}

async function handlePOST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = createAdminClient()

  const { data: appt } = await db
    .from('appointments')
    .select('hospital_id, patient_id, status, queue_position')
    .eq('id', id)
    .single()
  if (!appt) return Errors.notFound('Appointment')

  const caller = await resolveCaller(req, appt)
  if (caller instanceof NextResponse) return caller

  const { newPosition } = (await req.json()) as { newPosition?: number }
  if (!newPosition || newPosition < 1) return Errors.validation('newPosition is required')

  if (appt.status !== 'checked_in') return Errors.validation('Appointment is not currently checked in')

  if (!caller.isStaff) {
    if (appt.queue_position == null || newPosition <= appt.queue_position) {
      return Errors.validation('You can only move to a later position')
    }
  }

  const { error } = await db.rpc('move_appointment_in_queue', {
    p_appointment_id: id,
    p_new_position: newPosition,
  })
  if (error) return Errors.validation(error.message)
  return NextResponse.json({ success: true })
}
