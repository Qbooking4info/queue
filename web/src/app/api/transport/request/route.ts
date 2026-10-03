import { NextRequest, NextResponse, after } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole } from '@/lib/supabase/auth-server'
import { Errors } from '@/lib/api-error'
import { runDispatchRound } from '@/lib/dispatch/engine'
import { AUTH_CORS_HEADERS, corsOptions } from '@/lib/cors'

/**
 * POST /api/transport/request
 *
 * Creates a transport request and kicks off the first dispatch round.
 *
 * Two ways in, both a bearer token on the same Authorization header:
 *
 *   1. A patient's own session (the original, and still the common case) --
 *      resolved directly through users.auth_id, same as mobile's RLS does it.
 *      No requireRole here since requireRole only covers staff roles.
 *
 *   2. Hospital staff or a doctor requesting transport on a patient's behalf
 *      (front desk booking an ambulance for someone at the desk, a doctor
 *      mid-consult arranging an emergency transfer) -- checked FIRST via
 *      requireRole, since it's the narrower, role-gated path. A 403 from it
 *      (a real signed-in user who simply isn't staff -- the normal patient
 *      case) falls through to path 1; a 401 (no valid token at all) is
 *      returned immediately, since neither path can succeed without one.
 */
export async function OPTIONS() {
  return corsOptions()
}

export async function POST(req: NextRequest) {
  const res = await handlePOST(req)
  for (const [k, v] of Object.entries(AUTH_CORS_HEADERS)) res.headers.set(k, v)
  return res
}

const STAFF_REQUESTER_ROLES = ['hospital_admin', 'clinic_admin', 'front_desk', 'doctor'] as const

async function handlePOST(req: NextRequest) {
  const db = createAdminClient()

  let callerId: string        // users.id making the request
  let callerPhone: string | null
  let isStaffRequester = false
  let staffHospitalId: string | undefined

  const staffAuth = await requireRole([...STAFF_REQUESTER_ROLES], req)
  if (!(staffAuth instanceof NextResponse)) {
    isStaffRequester = true
    staffHospitalId = staffAuth.caller.hospitalId
    const { data: staffProfile } = await db.from('users')
      .select('id, phone').eq('auth_id', staffAuth.caller.authId).single()
    if (!staffProfile) return Errors.notFound('User')
    callerId = staffProfile.id
    callerPhone = staffProfile.phone
  } else if (staffAuth.status === 401) {
    return staffAuth // no valid token at all -- neither a staff nor a patient session
  } else {
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) return Errors.unauthenticated()

    const { data: userRes } = await db.auth.getUser(authHeader.slice(7))
    if (!userRes?.user) return Errors.unauthenticated()

    const { data: patientProfile } = await db.from('users')
      .select('id, phone').eq('auth_id', userRes.user.id).single()
    if (!patientProfile) return Errors.notFound('User')
    callerId = patientProfile.id
    callerPhone = patientProfile.phone
  }

  const body = await req.json()
  const {
    requestType = 'emergency',
    triageLevel,
    lat,
    lng,
    pickupAddress,
    pickupNotes,
    contactPhone,
    symptomDescription,
    requiredTier = 'BLS',
    requiredCapabilities = [],
    dependentId,
    destinationHospitalId,
    scheduledFor,
    requesterRelationship = 'self',
    paymentMethod,
    // Staff-initiated only: an existing registered patient by id, or a named
    // walk-in with no account -- mirrors the walk-in appointment pattern
    // (walkin_patient_name/phone) rather than inventing a new one.
    patientId,
    walkinPatientName,
    walkinPatientPhone,
  } = body

  // Range-checked, not just typeof: NaN and Infinity are both `number`, and
  // NaN reaches Postgres as POINT(NaN NaN) — a 500 on insert rather than a
  // useful 400. An out-of-range but finite pair is worse: it inserts fine and
  // silently produces a pickup point no unit can ever be near.
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return Errors.validation('Valid pickup coordinates are required')
  }
  if (requestType === 'emergency' && !triageLevel) {
    return Errors.validation('Triage level is required for emergency transport')
  }
  if (triageLevel != null && (!Number.isInteger(triageLevel) || triageLevel < 1 || triageLevel > 5)) {
    return Errors.validation('Triage level must be between 1 and 5')
  }
  if (requestType === 'scheduled' && !scheduledFor) {
    return Errors.validation('scheduledFor is required for scheduled transport')
  }

  let subjectPatientId: string | null = null
  let subjectDependentId: string | null = null
  let subjectCallerName: string | null = null
  let resolvedRequesterRelationship = requesterRelationship

  if (isStaffRequester) {
    if (patientId) {
      const { data: patient } = await db.from('users').select('id').eq('id', patientId).single()
      if (!patient) return Errors.validation('patientId does not match a registered patient')
      subjectPatientId = patient.id
    } else if (walkinPatientName?.trim()) {
      subjectCallerName = walkinPatientName.trim()
    } else {
      return Errors.validation('patientId or walkinPatientName is required')
    }
    resolvedRequesterRelationship = 'staff'
  } else {
    // A dependent booking must actually be the caller's dependent. Checked here
    // because this route uses the service role and bypasses RLS.
    if (dependentId) {
      const { data: dep } = await db.from('dependents')
        .select('id')
        .eq('id', dependentId)
        .eq('user_id', callerId)
        .single()
      if (!dep) return Errors.forbidden('That dependent does not belong to you')
      subjectDependentId = dependentId
    } else {
      subjectPatientId = callerId
    }
  }

  // Duplicate guard: one live emergency request per caller (staff included --
  // this stops one front desk clerk double-tapping, same as it stops a
  // panicked patient double-tapping). Two ambulances to one incident is a
  // real cost to the network either way.
  if (requestType === 'emergency') {
    const { data: live } = await db.from('transport_requests')
      .select('id, booking_ref, status')
      .eq('requester_id', callerId)
      .in('status', ['requested', 'searching', 'matched', 'en_route_to_patient', 'on_scene', 'transporting'])
      .limit(1)

    if (live?.length) {
      return NextResponse.json(
        { request: live[0], duplicate: true },
        { status: 200 },
      )
    }
  }

  const { data: created, error } = await db.from('transport_requests')
    .insert({
      booking_ref: '', // trigger-generated (set_transport_booking_ref); '' satisfies the NOT NULL column
      request_type: requestType,
      status: requestType === 'emergency' ? 'requested' : 'scheduled',
      patient_id: subjectPatientId,
      dependent_id: subjectDependentId,
      requester_id: callerId,
      requester_relationship: subjectDependentId ? 'dependent' : resolvedRequesterRelationship,
      caller_patient_name: subjectCallerName,
      contact_phone: contactPhone || walkinPatientPhone || callerPhone,
      pickup_point: `SRID=4326;POINT(${lng} ${lat})`,
      pickup_address: pickupAddress ?? null,
      pickup_notes: pickupNotes ?? null,
      destination_hospital_id: destinationHospitalId ?? null,
      origin_hospital_id: isStaffRequester ? (staffHospitalId ?? null) : null,
      triage_level: triageLevel ?? null,
      required_tier: requiredTier,
      required_capabilities: requiredCapabilities,
      symptom_description: symptomDescription ?? null,
      scheduled_for: scheduledFor ?? null,
      payment_method: paymentMethod ?? null,
    })
    .select('id, booking_ref, status')
    .single()

  if (error) {
    console.error('[transport] create failed', error)
    return Errors.internal('Could not create transport request')
  }

  // Emergency dispatches immediately. Scheduled transport stays unassigned
  // until T minus 60 min so the nightly optimizer can still re-plan it.
  //
  // `after()` rather than a bare floating promise. On Vercel the function can be
  // frozen as soon as the response is flushed, so fire-and-forget work is not
  // guaranteed to run — and when it does run it may be whenever the instance is
  // next woken. Measured end to end on 2026-08-28: the first offer appeared
  // ~35 seconds after the 201, against a 60-second promise and a 30-second
  // offer TTL. Over half the patient's budget was being spent before any crew
  // was asked. after() keeps the response fast while holding the instance open
  // until dispatch has actually run.
  if (requestType === 'emergency') {
    // Callback form, not the promise form. Passing a promise starts the work
    // immediately and the response ends up waiting on it — measured at 2.4s to
    // return the 201, which is 2.4s of the patient staring at a spinner before
    // the tracking screen even appears. A callback runs after the response is
    // flushed, so the patient gets their booking straight away and dispatch
    // still completes under the platform's guarantee.
    after(() =>
      runDispatchRound(created.id).catch((err) =>
        console.error('[transport] initial dispatch failed', created.id, err),
      ),
    )
  }

  return NextResponse.json({ request: created }, { status: 201 })
}
