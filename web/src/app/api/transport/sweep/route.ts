import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { runDispatchRound } from '@/lib/dispatch/engine'

/**
 * GET|POST /api/transport/sweep — the scheduler tick for ambulance dispatch.
 *
 * Two jobs that nothing else in the system was doing:
 *
 * 1. Advance stranded searches. expire_stale_offers() (pg_cron, every 10s)
 *    flips timed-out offers to 'expired' and stops there. Declining an offer
 *    advances the round via /api/transport/offers/respond, but a crew that just
 *    *ignores* the push produced no caller at all — the request sat in
 *    'searching' forever with no further rounds, no no_unit_available, and no
 *    dispatcher alert, while the patient's app spun indefinitely. pg_cron
 *    cannot reach a Next.js route, so the re-invocation has to originate here.
 *
 * 2. Promote scheduled transport. Requests created with request_type
 *    'scheduled' are inserted with status 'scheduled' and were never dispatched
 *    by anything — /api/transport/request only kicks off a round for
 *    emergencies. They are promoted at T minus SCHEDULED_LEAD_MINUTES.
 *
 * Safe to call at any frequency and concurrently: runDispatchRound is guarded
 * by the request's own status and by the "already offered" check per unit, so a
 * duplicate tick is a no-op rather than a second fan-out. Nothing here throws on
 * a single request failing — one bad row must not stop the sweep.
 *
 * ── DRIVING THIS ENDPOINT ───────────────────────────────────────────────────
 * Nothing calls this on a schedule yet. It needs an external trigger roughly
 * every minute, sending `Authorization: Bearer $CRON_SECRET`.
 *
 * A web/vercel.json with a `* * * * *` cron was the original plan, but Vercel
 * rejects sub-daily crons on the Hobby plan and *fails the whole deployment*
 * when it sees one — it does not warn and carry on. If this project is on Pro,
 * re-add:
 *
 *   { "crons": [{ "path": "/api/transport/sweep", "schedule": "* * * * *" }] }
 *
 * Otherwise point any external scheduler at it. Until something does, ignored
 * dispatch offers still strand requests in 'searching' and scheduled transport
 * is still never promoted — the two bugs this endpoint exists to fix.
 */

export const dynamic = 'force-dynamic'

const SCHEDULED_LEAD_MINUTES = 60

// Bounded so one tick can't run unboundedly long on a backlog; the next tick
// picks up whatever is left.
const MAX_PER_TICK = 25

function authorize(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  // Fail closed. Without this the endpoint would let anyone drive dispatch.
  if (!secret) return false

  const header = req.headers.get('authorization')
  if (!header) return false

  // Constant-time: a plain === leaks the secret a byte at a time to anything
  // that can time the response, and this endpoint can fan out dispatch offers.
  const a = Buffer.from(header)
  const b = Buffer.from(`Bearer ${secret}`)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function GET(req: NextRequest) {
  return handle(req)
}

export async function POST(req: NextRequest) {
  return handle(req)
}

async function handle(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const nowIso = new Date().toISOString()

  const advanced: string[] = []
  const promoted: string[] = []
  const failed: Array<{ requestId: string; error: string }> = []

  // ── 1. searches with nothing left outstanding ────────────────────────────
  const { data: searching, error: searchingErr } = await db
    .from('transport_requests')
    .select('id, dispatch_offers(round, response, expires_at)')
    .eq('status', 'searching')
    .limit(MAX_PER_TICK)

  if (searchingErr) {
    console.error('[transport/sweep] failed to load searching requests', searchingErr)
    return NextResponse.json({ error: 'Sweep failed' }, { status: 500 })
  }

  type OfferRow = { round: number; response: string; expires_at: string }

  for (const row of (searching ?? []) as Array<{ id: string; dispatch_offers: OfferRow[] | null }>) {
    const offers = row.dispatch_offers ?? []

    // Still waiting on a live offer — leave it alone. Checking expires_at as
    // well as response means this doesn't depend on how recently the pg_cron
    // sweeper last ran.
    const hasLiveOffer = offers.some(
      (o) => o.response === 'pending' && new Date(o.expires_at) > new Date(nowIso),
    )
    if (hasLiveOffer) continue

    // A 'searching' request with no offers at all is one whose first round
    // never produced any — restart it at round 1 rather than skipping it.
    const lastRound = offers.reduce((max, o) => Math.max(max, o.round ?? 0), 0)

    try {
      await runDispatchRound(row.id, lastRound + 1)
      advanced.push(row.id)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[transport/sweep] advance failed', row.id, message)
      failed.push({ requestId: row.id, error: message })
    }
  }

  // ── 2. scheduled transport due for promotion ─────────────────────────────
  const dueBy = new Date(Date.now() + SCHEDULED_LEAD_MINUTES * 60_000).toISOString()

  const { data: due, error: dueErr } = await db
    .from('transport_requests')
    .select('id')
    .eq('status', 'scheduled')
    .not('scheduled_for', 'is', null)
    .lte('scheduled_for', dueBy)
    .order('scheduled_for', { ascending: true })
    .limit(MAX_PER_TICK)

  if (dueErr) {
    console.error('[transport/sweep] failed to load scheduled requests', dueErr)
  } else {
    for (const row of (due ?? []) as Array<{ id: string }>) {
      try {
        await runDispatchRound(row.id, 1)
        promoted.push(row.id)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[transport/sweep] promote failed', row.id, message)
        failed.push({ requestId: row.id, error: message })
      }
    }
  }

  return NextResponse.json({
    sweptAt: nowIso,
    advanced: advanced.length,
    promoted: promoted.length,
    failed: failed.length,
    ...(failed.length ? { failures: failed } : {}),
  })
}
