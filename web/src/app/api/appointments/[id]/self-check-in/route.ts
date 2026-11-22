import { createAdminClient } from '@/lib/supabase/admin'
import { getServerUser } from '@/lib/supabase/auth-server'
import { NextRequest, NextResponse } from 'next/server'
import { Errors } from '@/lib/api-error'
import { checkInAppointment } from '@/lib/appointment-checkin'
import { todayLocalDate } from '@/lib/dashboard-utils'
import { AUTH_CORS_HEADERS, corsOptions } from '@/lib/cors'

export async function OPTIONS() {
  return corsOptions()
}

const DEFAULT_RADIUS_M = 500

/** Metres between two points. Haversine; good to a few metres at city scale. */
function metresBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/**
 * POST /api/appointments/[id]/self-check-in — a patient joining the queue on
 * arrival, from their own phone.
 *
 * Everything the front desk's check_in action does, under three guards it does
 * not need because a member of staff standing in the building is its own proof:
 *
 *   1. the hospital has turned it on (hospitals.allow_self_check_in, default
 *      false -- self check-in skips the desk, which is also where identity and
 *      payment are handled, so no hospital gets it without asking);
 *   2. the booking is for today;
 *   3. the phone is actually at the hospital.
 *
 * (3) is the one that matters. Without it a patient could join the queue from
 * home, take a number, and leave everyone physically present waiting behind
 * someone who is not there -- which is worse than the problem this solves.
 *
 * The check-in itself goes through checkInAppointment(), the same function the
 * staff action uses, so approval guards and queue numbering behave identically
 * however the patient got there.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const res = await handlePOST(req, { params })
  for (const [k, v] of Object.entries(AUTH_CORS_HEADERS)) res.headers.set(k, v)
  return res
}

async function handlePOST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getServerUser(req)
  if (!user) return Errors.unauthenticated()
  const { id } = await params

  const db = createAdminClient()
  const { data: profile } = await db.from('users').select('id').eq('auth_id', user.id).single()
  if (!profile) return Errors.notFound('User profile')

  const body = await req.json().catch(() => ({})) as { lat?: number; lng?: number }
  const { lat, lng } = body
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return Errors.validation('lat and lng are required — we check you are at the hospital before giving you a number')
  }

  const { data: appt } = await db
    .from('appointments')
    .select('id, patient_id, dependent_id, hospital_id, appointment_date, status, check_in_date')
    .eq('id', id)
    .single()
  if (!appt) return Errors.notFound('Appointment')

  // Your own booking, or one you manage for a dependent. Mirrors
  // current_patient_ids(), which RLS uses -- resolved here in TypeScript
  // because this route reads through the admin client, where auth.uid() is
  // not set and that function would return nothing.
  let mayAct = appt.patient_id === profile.id
  if (!mayAct && appt.patient_id) {
    const { count } = await db
      .from('dependent_links')
      .select('*', { count: 'exact', head: true })
      .eq('caretaker_id', profile.id)
      .eq('dependent_id', appt.patient_id)
      .eq('status', 'active')
      .is('unlinked_at', null)
    mayAct = (count ?? 0) > 0
  }
  if (!mayAct) return Errors.forbidden('This is not your booking')

  if (!appt.hospital_id) {
    return Errors.validation('This booking has no hospital to check in at')
  }

  const today = todayLocalDate()
  if (appt.appointment_date !== today && appt.check_in_date !== today) {
    return Errors.validation('You can only check in on the day of your appointment')
  }

  // Cast: allow_self_check_in arrives with 20261121000009 and src/types/database.ts
  // is generated, so the checked-in types do not know the column until they are
  // regenerated. Same pattern the other routes use for freshly added columns.
  const { data: hospitalRow } = await (db.from('hospitals') as any)
    .select('name, latitude, longitude, allow_self_check_in')
    .eq('id', appt.hospital_id)
    .single()
  const hospital = hospitalRow as {
    name: string
    latitude: number | null
    longitude: number | null
    allow_self_check_in: boolean | null
  } | null
  if (!hospital) return Errors.notFound('Hospital')

  if (!hospital.allow_self_check_in) {
    return NextResponse.json(
      { error: `${hospital.name} checks patients in at the front desk. Please see the desk when you arrive.`, code: 'SELF_CHECK_IN_OFF' },
      { status: 403 },
    )
  }

  const hLat = hospital.latitude
  const hLng = hospital.longitude
  if (hLat == null || hLng == null) {
    // No coordinates means the distance check cannot run, and running it
    // against a guess would either lock out everyone or let in anyone.
    return NextResponse.json(
      { error: `${hospital.name} has not set its location, so we cannot confirm you have arrived. Please see the front desk.`, code: 'NO_HOSPITAL_LOCATION' },
      { status: 409 },
    )
  }

  const { data: cfg } = await db.from('app_config').select('value').eq('key', 'self_check_in_radius_m').maybeSingle()
  const radius = Number((cfg as { value?: string } | null)?.value) || DEFAULT_RADIUS_M

  const distance = Math.round(metresBetween({ lat, lng }, { lat: hLat, lng: hLng }))
  if (distance > radius) {
    return NextResponse.json(
      {
        error: `You look about ${distance < 2000 ? `${distance} m` : `${(distance / 1000).toFixed(1)} km`} from ${hospital.name}. Check in once you have arrived.`,
        code: 'TOO_FAR',
        distanceM: distance,
      },
      { status: 409 },
    )
  }

  const result = await checkInAppointment(db, id)
  if (!result.ok) return Errors.validation(result.error)

  const { data: row } = await db
    .from('appointments')
    .select('queue_position, estimated_wait')
    .eq('id', id)
    .single()

  return NextResponse.json({
    success: true,
    queuePosition: (row as { queue_position: number | null } | null)?.queue_position ?? null,
    estimatedWait: (row as { estimated_wait: number | null } | null)?.estimated_wait ?? null,
  })
}
