import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Errors } from '@/lib/api-error'
import { runDispatchRound } from '@/lib/dispatch/engine'
import { isOnShiftCrew } from '@/lib/dispatch/crew-identity'

/**
 * POST /api/transport/offers/respond   { offerId, action: 'accept' | 'decline', reason? }
 *
 * The accept path delegates to accept_dispatch_offer(), which resolves the
 * broadcast race inside a single transaction. Losing a race is a normal
 * outcome, not an error — the crew sees "already covered", HTTP 200.
 */
export async function POST(req: NextRequest) {
  const db = createAdminClient()

  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return Errors.unauthenticated()

  const { data: userRes } = await db.auth.getUser(authHeader.slice(7))
  if (!userRes?.user) return Errors.unauthenticated()

  const { offerId, action, reason } = await req.json()
  if (!offerId || !['accept', 'decline'].includes(action)) {
    return Errors.validation('offerId and action (accept|decline) are required')
  }

  const { data: offer } = await db.from('dispatch_offers')
    .select('id, request_id, ambulance_id, round, response, expires_at')
    .eq('id', offerId)
    .single()

  if (!offer) return Errors.notFound('Offer')

  // The responder must be on the shift crew of the offered unit right now.
  // This used to embed `ambulance_crew!inner`, which silently excluded every
  // hospital-fleet crew member (they are named by hospital_admin_id instead)
  // and answered "You are not on the crew for this unit" to the whole feature.
  if (!(await isOnShiftCrew(db, offer.ambulance_id, userRes.user.id))) {
    return Errors.forbidden('You are not on the crew for this unit')
  }

  if (offer.response !== 'pending' || new Date(offer.expires_at) <= new Date()) {
    return NextResponse.json({ accepted: false, reason: 'offer_no_longer_open' })
  }

  if (action === 'decline') {
    await db.from('dispatch_offers')
      .update({ response: 'declined', responded_at: new Date().toISOString(), decline_reason: reason ?? null })
      .eq('id', offerId)
      .eq('response', 'pending')

    // Advance immediately rather than waiting for the sweeper — there is
    // nothing left pending to wait for on a sequential offer.
    runDispatchRound(offer.request_id, offer.round + 1).catch((err) =>
      console.error('[transport] re-dispatch after decline failed', offer.request_id, err),
    )

    return NextResponse.json({ accepted: false, reason: 'declined' })
  }

  const { data: won, error } = await db.rpc('accept_dispatch_offer', {
    p_offer_id: offerId,
    p_auth_id: userRes.user.id,
  })

  if (error) {
    console.error('[transport] accept failed', error)
    return Errors.internal('Could not accept the offer')
  }

  if (!won) {
    return NextResponse.json({ accepted: false, reason: 'already_covered' })
  }

  const { data: request } = await db.from('transport_requests')
    .select('id, booking_ref, requester_id, pickup_address, triage_level, symptom_description')
    .eq('id', offer.request_id)
    .single()

  if (request) {
    await db.from('notifications').insert({
      user_id: request.requester_id,
      title: 'Ambulance on the way',
      body: 'A crew has accepted and is heading to you now.',
      type: 'transport',
      data: { request_id: request.id, booking_ref: request.booking_ref },
    })
  }

  return NextResponse.json({ accepted: true, request })
}
