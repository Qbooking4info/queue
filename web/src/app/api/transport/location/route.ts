import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Errors } from '@/lib/api-error'

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

  const { data: onShift } = await db.from('ambulance_shifts')
    .select('id, ambulance_shift_crew!inner(ambulance_crew!inner(is_active, users!inner(auth_id)))')
    .eq('ambulance_id', ambulanceId)
    .lte('starts_at', new Date().toISOString())
    .gte('ends_at', new Date().toISOString())
    .limit(1)

  const authorised = (onShift ?? []).some((s) =>
    (s.ambulance_shift_crew ?? []).some(
      (sc) => sc?.ambulance_crew?.is_active && sc?.ambulance_crew?.users?.auth_id === userRes.user!.id,
    ),
  )

  if (!authorised) return Errors.forbidden('You are not on the crew for this unit')

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

  // Rejected pings are normal (drift, duplicates after a reconnect) — the crew
  // app should not treat a low accept count as an error.
  return NextResponse.json({ received: pings.length, accepted })
}
