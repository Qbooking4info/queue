import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Errors } from '@/lib/api-error'

/**
 * POST /api/transport/triage
 *
 * v3.1 "dispatch first": an SOS goes out the moment the patient finishes the hold,
 * and the three tap-only questions are answered while the crew is being found.
 * This records those answers on the request so the crew and the receiving hospital
 * see them. Triage can only be raised here, never lowered -- a crew already sent as
 * top priority must not be quietly downgraded by a mis-tap.
 *
 * Body: { requestId, breathingNormally?, awake?, heavyBleeding? } -- each true | false | null.
 */
const ACTIVE = ['requested', 'searching', 'matched', 'en_route_to_patient', 'on_scene']

export async function POST(req: NextRequest) {
  const db = createAdminClient()
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return Errors.unauthenticated()
  const { data: userRes } = await db.auth.getUser(authHeader.slice(7))
  if (!userRes?.user) return Errors.unauthenticated()
  const { data: caller } = await db.from('users').select('id').eq('auth_id', userRes.user.id).single()
  if (!caller) return Errors.notFound('User')

  const body = await req.json().catch(() => null) as {
    requestId?: string; breathingNormally?: boolean | null; awake?: boolean | null; heavyBleeding?: boolean | null
  } | null
  if (!body?.requestId) return Errors.validation('requestId is required')

  const { data: request } = await db.from('transport_requests')
    .select('id, requester_id, status, triage_level, symptom_description')
    .eq('id', body.requestId).single()
  if (!request) return Errors.notFound('Transport request')
  if (request.requester_id !== caller.id) return Errors.forbidden()
  if (!ACTIVE.includes(request.status)) return Errors.validation('This request is no longer active')

  const critical = body.breathingNormally === false || body.awake === false || body.heavyBleeding === true
  const answered = [
    body.breathingNormally != null && `breathing normally: ${body.breathingNormally ? 'yes' : 'no'}`,
    body.awake != null && `awake: ${body.awake ? 'yes' : 'no'}`,
    body.heavyBleeding != null && `heavy bleeding: ${body.heavyBleeding ? 'yes' : 'no'}`,
  ].filter(Boolean).join(', ')

  const current = request.triage_level ?? 3
  const triageLevel = critical ? Math.min(current, 1) : current
  const { error } = await db.from('transport_requests').update({
    triage_level: triageLevel,
    symptom_description: answered ? `SOS · ${answered}` : request.symptom_description,
  }).eq('id', request.id)
  if (error) return Errors.internal(error.message)

  return NextResponse.json({ ok: true, triageLevel })
}
