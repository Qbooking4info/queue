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
import { roadEtas } from './routing'
import {
  policyFor,
  rankCandidates,
  selectOffers,
  type Candidate,
  type TransportRequest,
  type UnitTier,
} from './matching'

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
  // not a vehicle.
  const { data: crew } = await db.from('ambulance_shifts')
    .select('ambulance_id, ambulance_shift_crew(ambulance_crew(user_id))')
    .in('ambulance_id', offers.map((o) => o.ambulance_id))
    .lte('starts_at', new Date().toISOString())
    .gte('ends_at', new Date().toISOString())

  const rows: Array<{ user_id: string; title: string; body: string; type: string; data: Record<string, string | number> }> = []

  for (const offer of offers) {
    // Every currently-open shift on the unit, not just the first match — a
    // handover window puts two overlapping shift rows on one ambulance, and
    // find() would silently page only one of the two crews.
    const shifts = (crew ?? []).filter((s) => s.ambulance_id === offer.ambulance_id)
    const notified = new Set<string>()
    for (const sc of shifts.flatMap((s) => s.ambulance_shift_crew ?? [])) {
      const userId = sc?.ambulance_crew?.user_id
      if (!userId || notified.has(userId)) continue
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
