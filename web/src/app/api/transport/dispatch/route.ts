import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/supabase/auth-server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Errors } from '@/lib/api-error'
import { runDispatchRound } from '@/lib/dispatch/engine'

/**
 * POST /api/transport/dispatch   { requestId, round? }
 *
 * Manual re-dispatch from the dispatcher console, and the target for the
 * scheduled-transport cron that promotes bookings at T minus 60 minutes.
 *
 * The patient-facing path does not come through here — /api/transport/request
 * calls the engine directly on create.
 */
export async function POST(req: NextRequest) {
  const auth = await requireRole(['super_admin', 'hospital_admin', 'clinic_admin'], req)
  if (auth instanceof NextResponse) return auth
  const { caller } = auth

  const { requestId, round = 1 } = await req.json()
  if (!requestId) return Errors.validation('requestId is required')

  // `round` is client-supplied and indexes policy.searchRadiusMeters. A zero or
  // negative value indexes off the front of that array, leaving the radius
  // undefined and passing undefined straight into find_candidate_units.
  if (!Number.isInteger(round) || round < 1) {
    return Errors.validation('round must be a positive integer')
  }

  // Ownership check. requestId was previously taken on trust, so any
  // hospital_admin could drive dispatch rounds on ANY transport request in the
  // system — fanning out offers, burning rounds, and pushing another hospital's
  // request to no_unit_available. Authentication was enforced; authorisation
  // was not.
  //
  // A request belongs to a hospital if that hospital is the destination, or if
  // it owns the fleet the request is already assigned to. super_admin is
  // unscoped. Anything else is refused rather than guessed at.
  if (caller.role !== 'super_admin') {
    if (!caller.hospitalId) return Errors.forbidden()

    const db = createAdminClient()
    const { data: tr } = await db
      .from('transport_requests')
      .select('id, destination_hospital_id, assigned_unit_id')
      .eq('id', requestId)
      .single()

    if (!tr) return Errors.notFound('Transport request')

    let owns = tr.destination_hospital_id === caller.hospitalId

    if (!owns && tr.assigned_unit_id) {
      const { data: unit } = await db
        .from('ambulances')
        .select('ambulance_providers(hospital_id)')
        .eq('id', tr.assigned_unit_id)
        .single()
      const provider = (unit as { ambulance_providers?: { hospital_id: string | null } } | null)?.ambulance_providers
      owns = provider?.hospital_id === caller.hospitalId
    }

    if (!owns) return Errors.forbidden("Cannot dispatch another hospital's transport request")
  }

  try {
    const result = await runDispatchRound(requestId, round)
    return NextResponse.json(result)
  } catch (err) {
    console.error('[transport] dispatch round failed', requestId, round, err)
    return Errors.internal('Dispatch failed')
  }
}
