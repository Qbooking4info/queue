/**
 * Queue — dispatch engine
 *
 * One call = one dispatch round. It does not block waiting for a crew to
 * accept; it creates offers and returns. The round advances when the offer
 * sweeper fires or a crew declines, either of which re-invokes this with an
 * incremented round.
 *
 * Round scoped rather than long polling means a serverless timeout or a
 * redeploy mid dispatch cannot strand a request. State lives in
 * dispatch_offers, not in a running process.
 */

import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { onShiftCrewUserIds } from './crew-identity'
import { roadEtas } from './routing'
import {
  policyFor,
  rankCandidates,
  rejectionTally,
  selectOffers,
  type Candidate,
  type TransportRequest,
  type UnitTier,
} from './matching'

/**
 * Record what this round saw. Never throws and never blocks the round — a
 * failure to write instrumentation must not be able to stop an ambulance being
 * dispatched, so every error here is swallowed after logging.
 *
 * nearest_unit_stats deliberately ignores the filters find_candidate_units
 * applies, so a round that found nothing still records how far away the nearest
 * rig actually was. That distinction is the whole point: "no unit available"
 * with the nearest rig 400m away and off duty is an adoption problem, and the
 * same message with the nearest rig 40km away is a coverage problem.
 */
async function recordAttempt(
  db: Db,
  requestId: string,
  fields: {
    round: number
    radiusMeters: number
    candidatesFound: number
    candidatesAfterFilter: number
    rejectReasons: Record<string, number>
    offersMade: number
  },
): Promise<void> {
  try {
    const { data: stats } = await db.rpc('nearest_unit_stats', { p_request_id: requestId })
    const s = (Array.isArray(stats) ? stats[0] : stats) as
      | { nearest_unit_m: number | null; active_units_total: number | null; on_duty_units_total: number | null }
      | null

    await db.from('dispatch_attempts').insert({
      request_id: requestId,
      round: fields.round,
      radius_m: fields.radiusMeters,
      candidates_found: fields.candidatesFound,
      candidates_after_filter: fields.candidatesAfterFilter,
      reject_reasons: fields.rejectReasons,
      offers_made: fields.offersMade,
      nearest_unit_m: s?.nearest_unit_m ?? null,
      active_units_total: s?.active_units_total ?? null,
      on_duty_units_total: s?.on_duty_units_total ?? null,
    })
  } catch (err) {
    console.warn('[dispatch] failed to record attempt', requestId, fields.round, err)
  }
}

type Db = ReturnType<typeof createAdminClient>

export interface DispatchResult {
  round?: number
  strategy?: string
  radiusMeters?: number
  offered?: Array<{ unitId: string; etaSeconds: number; score: number }>
  expiresAt?: string
  skipped?: boolean
  exhausted?: boolean
  reason?: string
}

export async function runDispatchRound(
  requestId: string,
  round = 1,
): Promise<DispatchResult> {
  const db = createAdminClient()

  const { data: request, error } = await db.from('transport_requests')
    .select('*')
    .eq('id', requestId)
    .single()

  if (error || !request) throw new Error(`transport request not found: ${requestId}`)

  // Idempotency guard. A retry must not fan out a second set of offers on a job
  // that already has a crew.
  if (!['requested', 'scheduled', 'searching'].includes(request.status)) {
    return { skipped: true, reason: `status is ${request.status}` }
  }

  const req: TransportRequest = {
    id: request.id,
    requestType: request.request_type as 'emergency' | 'scheduled',
    triageLevel: request.triage_level,
    requiredTier: request.required_tier as UnitTier,
    requiredCapabilities: request.required_capabilities ?? [],
    referenceTime: request.scheduled_for ? Date.parse(request.scheduled_for) : Date.now(),
    destinationHospitalId: request.destination_hospital_id,
    estimatedJobDurationSec: estimateJobDuration(request),
  }

  const policy = policyFor(req)

  if (round > policy.maxRounds) return exhaustSearch(db, request)

  if (request.status !== 'searching') {
    await db.from('transport_requests')
      .update({ status: 'searching', updated_at: new Date().toISOString() })
      .eq('id', requestId)
      .in('status', ['requested', 'scheduled'])
  }

  const radius =
    policy.searchRadiusMeters[Math.min(round - 1, policy.searchRadiusMeters.length - 1)]

  const { data: rows, error: rpcError } = await db.rpc('find_candidate_units', {
    p_request_id: requestId,
    p_radius_m: radius,
    p_limit: 12,
  })
  if (rpcError) throw rpcError

  if (!rows?.length) {
    // The most important row to record: nobody was even in range. Awaited, not
    // fire-and-forget, because advanceOrExhaust may recurse or terminate the
    // request and this must land first.
    await recordAttempt(db, requestId, {
      round, radiusMeters: radius, candidatesFound: 0,
      candidatesAfterFilter: 0, rejectReasons: {}, offersMade: 0,
    })
    return advanceOrExhaust(db, request, round, policy.maxRounds, 'no candidates in radius')
  }

  // Units already asked in an earlier round do not get re-asked.
  const { data: prior } = await db.from('dispatch_offers')
    .select('ambulance_id')
    .eq('request_id', requestId)

  const asked = new Set((prior ?? []).map((o: { ambulance_id: string }) => o.ambulance_id))
  const fresh = (rows as RawCandidate[]).filter((r) => !asked.has(r.unit_id))

  if (!fresh.length) {
    return advanceOrExhaust(db, request, round, policy.maxRounds, 'all nearby units already offered')
  }

  // Road ETAs only for units that survived the DB filters — this is the
  // expensive call in the round.
  const { data: pickup } = await db.rpc('get_request_pickup_latlng', {
    p_request_id: requestId,
  })
  const dest = Array.isArray(pickup) ? pickup[0] : pickup
  if (!dest) throw new Error(`pickup point missing for request: ${requestId}`)

  const etas = await roadEtas(
    fresh.map((r) => ({ lat: r.current_lat, lng: r.current_lng })),
    { lat: dest.lat, lng: dest.lng },
  )

  const candidates: Candidate[] = fresh.map((r, i) => ({
    unitId: r.unit_id,
    providerId: r.provider_id,
    providerType: r.provider_type,
    providerHospitalId: r.provider_hospital_id,
    reliabilityScore: Number(r.reliability_score),
    vehicleTier: r.vehicle_tier,
    crewTier: r.crew_tier,
    capabilities: r.capabilities ?? [],
    etaSeconds: etas[i],
    straightLineMeters: Number(r.straight_line_m),
    shiftEndsAt: Date.parse(r.shift_ends_at),
    lastDispatchedAt: r.last_dispatched_at ? Date.parse(r.last_dispatched_at) : null,
  }))

  const ranked = rankCandidates(req, candidates, policy)
  if (!ranked.length) {
    // Units were in range but none were usable. The tally says why, which is a
    // different and more actionable signal than "no ambulance available".
    await recordAttempt(db, requestId, {
      round, radiusMeters: radius, candidatesFound: candidates.length,
      candidatesAfterFilter: 0, rejectReasons: rejectionTally(req, candidates), offersMade: 0,
    })
    return advanceOrExhaust(db, request, round, policy.maxRounds, 'all candidates failed hard filters')
  }

  const chosen = selectOffers(ranked, policy)
  const expiresAt = new Date(Date.now() + policy.offerTtlSeconds * 1000)

  const { data: offers, error: insertError } = await db.from('dispatch_offers')
    .insert(
      chosen.map((c, i) => ({
        request_id: requestId,
        ambulance_id: c.unitId,
        round,
        rank: i + 1,
        score: Number(c.score.toFixed(4)),
        eta_seconds: c.resolvedEtaSeconds,
        expires_at: expiresAt.toISOString(),
      })),
    )
    .select('id, ambulance_id')

  if (insertError) throw insertError

  await notifyCrews(db, requestId, offers ?? [], policy.offerTtlSeconds)

  // Successful rounds are recorded too — the ratio of offers made to offers
  // accepted is how you tell a coverage problem from crews ignoring the app.
  await recordAttempt(db, requestId, {
    round, radiusMeters: radius, candidatesFound: candidates.length,
    candidatesAfterFilter: ranked.length,
    rejectReasons: rejectionTally(req, candidates), offersMade: chosen.length,
  })

  return {
    round,
    strategy: policy.strategy,
    radiusMeters: radius,
    offered: chosen.map((c) => ({
      unitId: c.unitId,
      etaSeconds: c.resolvedEtaSeconds,
      score: Number(c.score.toFixed(4)),
    })),
    expiresAt: expiresAt.toISOString(),
  }
}

/**
 * Failing to find an ambulance must never be silent. The requester gets plain
 * language and an emergency fallback; a human dispatcher gets paged.
 */
async function exhaustSearch(db: Db, request: RequestRow): Promise<DispatchResult> {
  await db.from('transport_requests')
    .update({ status: 'no_unit_available', updated_at: new Date().toISOString() })
    .eq('id', request.id)
    .eq('status', 'searching')

  await db.from('dispatcher_alerts').insert({
    request_id: request.id,
    severity: request.triage_level && request.triage_level <= 2 ? 'critical' : 'high',
    kind: 'no_unit_available',
    message: 'Automated dispatch exhausted all rounds. Manual intervention needed.',
  })

  await db.from('notifications').insert({
    user_id: request.requester_id,
    title: 'No ambulance available',
    body: 'We could not reach an available ambulance. Please call emergency services directly.',
    type: 'transport',
    data: { request_id: request.id, show_emergency_fallback: true },
  })

  return { exhausted: true, reason: 'no_unit_available' }
}

async function advanceOrExhaust(
  db: Db,
  request: RequestRow,
  round: number,
  maxRounds: number,
  reason: string,
): Promise<DispatchResult> {
  if (round >= maxRounds) return exhaustSearch(db, request)
  const next = await runDispatchRound(request.id, round + 1)
  return { ...next, reason }
}

/**
 * Placeholder until you have real trip data. Replace with a rolling median by
 * triage level and route — this number drives the shift headroom filter, so a
 * bad estimate here silently shrinks your usable fleet.
 */
function estimateJobDuration(request: RequestRow): number {
  return (request.request_type === 'emergency' ? 45 : 60) * 60
}

async function notifyCrews(
  db: Db,
  requestId: string,
  offers: Array<{ id: string; ambulance_id: string }>,
  ttlSeconds: number,
) {
  if (!offers.length) return

  // Resolve on-shift crew for each offered unit so the push lands on a person,
  // not a vehicle. Goes through the shared helper because this used to read
  // `ambulance_shift_crew(ambulance_crew(user_id))` only — which resolves to
  // null for hospital-fleet crew, so no offer notification was ever written
  // for them and the unit sat silent through the whole 60s deadline.
  const byUnit = await onShiftCrewUserIds(db, offers.map((o) => o.ambulance_id))

  const rows: Array<{ user_id: string; title: string; body: string; type: string; data: Record<string, string | number> }> = []

  for (const offer of offers) {
    const notified = new Set<string>()
    for (const userId of byUnit.get(offer.ambulance_id) ?? []) {
      if (notified.has(userId)) continue
      notified.add(userId)
      rows.push({
        user_id: userId,
        title: 'New dispatch offer',
        body: `You have ${ttlSeconds}s to accept.`,
        type: 'dispatch_offer',
        data: { offer_id: offer.id, request_id: requestId, ttl_seconds: ttlSeconds },
      })
    }
  }

  if (rows.length) await db.from('notifications').insert(rows)
}

interface RawCandidate {
  unit_id: string
  provider_id: string
  provider_type: 'hospital_fleet' | 'third_party'
  provider_hospital_id: string | null
  reliability_score: number
  vehicle_tier: UnitTier
  crew_tier: UnitTier
  capabilities: string[]
  current_lat: number
  current_lng: number
  straight_line_m: number
  shift_ends_at: string
  last_dispatched_at: string | null
}

interface RequestRow {
  id: string
  request_type: string
  triage_level: number | null
  requester_id: string
  status: string
  [key: string]: unknown
}
