import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Errors } from '@/lib/api-error'
import { runDispatchRound } from '@/lib/dispatch/engine'

/**
 * POST /api/transport/request
 *
 * Creates a transport request and kicks off the first dispatch round.
 *
 * Auth here is the patient's own session, not requireRole — requireRole only
 * covers staff roles. The caller is resolved through users.auth_id the same way
 * the mobile RLS policies do it.
 */
export async function POST(req: NextRequest) {
  const db = createAdminClient()

  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return Errors.unauthenticated()

  const { data: userRes } = await db.auth.getUser(authHeader.slice(7))
  if (!userRes?.user) return Errors.unauthenticated()

  const { data: caller } = await db.from('users')
    .select('id, phone, full_name')
    .eq('auth_id', userRes.user.id)
    .single()

  if (!caller) return Errors.notFound('User')

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
  } = body

  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return Errors.validation('Pickup coordinates are required')
  }
  if (requestType === 'emergency' && !triageLevel) {
    return Errors.validation('Triage level is required for emergency transport')
  }
  if (requestType === 'scheduled' && !scheduledFor) {
    return Errors.validation('scheduledFor is required for scheduled transport')
  }

  // A dependent booking must actually be the caller's dependent. Checked here
  // because this route uses the service role and bypasses RLS.
  if (dependentId) {
    const { data: dep } = await db.from('dependents')
      .select('id')
      .eq('id', dependentId)
      .eq('user_id', caller.id)
      .single()
    if (!dep) return Errors.forbidden('That dependent does not belong to you')
  }

  // Duplicate guard: one live emergency request per caller. Panicked users tap
  // twice, and two ambulances to one incident is a real cost to the network.
  if (requestType === 'emergency') {
    const { data: live } = await db.from('transport_requests')
      .select('id, booking_ref, status')
      .eq('requester_id', caller.id)
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
      patient_id: dependentId ? null : caller.id,
      dependent_id: dependentId ?? null,
      requester_id: caller.id,
      requester_relationship: dependentId ? 'dependent' : requesterRelationship,
      contact_phone: contactPhone || caller.phone,
      pickup_point: `SRID=4326;POINT(${lng} ${lat})`,
      pickup_address: pickupAddress ?? null,
      pickup_notes: pickupNotes ?? null,
      destination_hospital_id: destinationHospitalId ?? null,
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
  if (requestType === 'emergency') {
    runDispatchRound(created.id).catch((err) =>
      console.error('[transport] initial dispatch failed', created.id, err),
    )
  }

  return NextResponse.json({ request: created }, { status: 201 })
}
