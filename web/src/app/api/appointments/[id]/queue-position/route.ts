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
  // Pulled out of `appt` so the narrowing from the guards above survives into the
  // closure below -- TS re-widens a property read inside a callback.
  const hospitalId = appt.hospital_id
  const checkInDate = appt.check_in_date

  const inThisQueue = () => db.from('appointments')
    .select('id', { count: 'exact', head: true })
    .eq('hospital_id', hospitalId).eq('check_in_date', checkInDate)
    .in('status', ['checked_in', 'in_progress'])
    .or(doctorFilter)

  const tierSizeQuery = isEmergency
    ? inThisQueue().eq('urgency', 'emergency')
    : inThisQueue().neq('urgency', 'emergency')

  // How many people are genuinely in front of this patient, and how many of
  // those are emergencies. A bare rank is what makes a legitimate queue change
  // read as a purchased jump -- the patient watches 4 become 5 and has no way
  // to learn that an ambulance arrived. Counting the emergencies separately
  // lets the app say so. Both are counted over the whole queue (not the
  // caller's own urgency tier) because "ahead of me" means ahead of me.
  const pos = appt.queue_position
  const ahead = () => inThisQueue().lt('queue_position', pos as number)

  // Run in parallel: every checked-in patient polls this route every 15s, so
  // sequential round-trips here were multiplied latency for no reason.
  // Who the doctor is with right now. Every waiting room in the country has a
  // board showing this, and without it a patient holding number 7 has no way
  // to tell a queue that is moving from one that has stopped -- their own
  // number is identical in both cases.
  const nowServing = () => db.from('appointments')
    .select('queue_position')
    .eq('hospital_id', hospitalId).eq('check_in_date', checkInDate)
    .eq('status', 'in_progress')
    .or(doctorFilter)
    .not('queue_position', 'is', null)
    .order('queue_position', { ascending: true })
    .limit(1)
    .maybeSingle()

  const [
    { count: emergencyCount }, { count: tierSize }, { count: queueTotal },
    aheadRes, emgAheadRes, servingRes,
  ] = await Promise.all([
    inThisQueue().eq('urgency', 'emergency'),
    tierSizeQuery,
    inThisQueue(),
    pos == null ? Promise.resolve({ count: null }) : ahead(),
    pos == null ? Promise.resolve({ count: null }) : ahead().eq('urgency', 'emergency'),
    nowServing(),
  ])

  const tierOffset = isEmergency ? 0 : (emergencyCount ?? 0)
  const minPosition = tierOffset + 1
  const maxPosition = tierOffset + (tierSize ?? 1)

  return NextResponse.json({
    currentPosition: appt.queue_position, minPosition, maxPosition,
    // queueTotal is everyone waiting on THIS doctor today, both urgency tiers, so the
    // patient can read "3 of 24". Deliberately not maxPosition: that's the bound of the
    // caller's own tier, which for an emergency patient counts only the emergency tier
    // and would under-report the queue as a total.
    queueTotal: queueTotal ?? null,
    aheadOfYou: aheadRes.count ?? null,
    emergenciesAhead: emgAheadRes.count ?? null,
    // Null when the doctor is between patients, which the screen says as
    // "between patients" rather than leaving the last number up and implying
    // someone is still in the room.
    nowServing: (servingRes.data as { queue_position: number | null } | null)?.queue_position ?? null,
    estimatedWait: appt.estimated_wait, status: appt.status,
    // When these figures were true. The card polls every 15s and a phone that
    // has lost its connection shows the last good answer indefinitely, which is
    // indistinguishable from a live one unless we stamp it.
    asOf: new Date().toISOString(),
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
