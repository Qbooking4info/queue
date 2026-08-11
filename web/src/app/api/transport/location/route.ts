import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Errors } from '@/lib/api-error'
import { isOnShiftCrew } from '@/lib/dispatch/crew-identity'
import { refreshEtaForUnit } from '@/lib/dispatch/live-eta'

/**
 * POST /api/transport/location   { ambulanceId, pings: [{ lat, lng, heading, speedKmh, accuracyM, recordedAt }] }
 *
 * Accepts a batch because the crew app buffers locally through dead zones and
 * flushes on reconnect. Ordering is by the device's recordedAt, not arrival
 * time, so a backlog does not rewind the live position.
 *
 * Validation (drift, impossible jumps, stale fixes) lives in
 * record_unit_location() so every client gets identical rules.
 */
const MAX_PINGS_PER_BATCH = 500

export async function POST(req: NextRequest) {
  const db = createAdminClient()

  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return Errors.unauthenticated()

  const { data: userRes } = await db.auth.getUser(authHeader.slice(7))
  if (!userRes?.user) return Errors.unauthenticated()

  const { ambulanceId, pings } = await req.json()
  if (!ambulanceId || !Array.isArray(pings) || !pings.length) {
    return Errors.validation('ambulanceId and a non-empty pings array are required')
  }
  // Each ping costs one sequential RPC below, so an unbounded batch is an
  // open-ended request. A long dead zone still flushes, just across a few calls.
  if (pings.length > MAX_PINGS_PER_BATCH) {
    return Errors.validation(`At most ${MAX_PINGS_PER_BATCH} pings per batch`)
  }

  // Both crew identity paths — the previous `ambulance_crew!inner` embed
  // rejected hospital-fleet crew, so their unit never sent a ping and never
  // became visible to dispatch at all.
  if (!(await isOnShiftCrew(db, ambulanceId, userRes.user.id))) {
    return Errors.forbidden('You are not on the crew for this unit')
  }

  const ordered = [...pings].sort(
    (a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt),
  )

  let accepted = 0
  for (const p of ordered) {
    const { data: ok } = await db.rpc('record_unit_location', {
      p_ambulance_id: ambulanceId,
      p_lat: p.lat,
      p_lng: p.lng,
      p_heading: p.heading ?? null,
      p_speed_kmh: p.speedKmh ?? null,
      p_accuracy_m: p.accuracyM ?? null,
      p_recorded_at: p.recordedAt,
    })
    if (ok) accepted++
  }

  // A moved unit is the only moment new ETA information exists, so recompute
  // here rather than on a timer. Throttled inside refreshEtaForUnit, and it
  // never throws — a routing provider having a bad minute must not turn into a
  // failed location ping, which would make the unit invisible to dispatch.
  if (accepted > 0) {
    const latest = ordered[ordered.length - 1]
    await refreshEtaForUnit(db, ambulanceId, { lat: latest.lat, lng: latest.lng })
      .catch(err => console.warn('[transport] eta refresh failed', err))
  }

  // Rejected pings are normal (drift, duplicates after a reconnect) — the crew
  // app should not treat a low accept count as an error.
  return NextResponse.json({ received: pings.length, accepted })
}
