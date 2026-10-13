import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/supabase/auth-server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/ambulances/receive   { requestId }
 *
 * The receiving hospital confirms the patient has been handed over, which
 * completes the trip (disposition 'transported') and frees the ambulance.
 * hospital_receive_transport() only accepts a request whose destination is
 * the caller's hospital and that is transporting or arrived.
 */
export async function POST(req: NextRequest) {
  const auth = await requireRole(['hospital_admin', 'front_desk'], req)
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  if (!caller.hospitalId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null) as { requestId?: string } | null
  if (!body?.requestId) return NextResponse.json({ error: 'requestId is required' }, { status: 400 })

  const db = createAdminClient()
  const { data: me } = await db.from('users').select('id').eq('auth_id', caller.authId).single()

  // Not in the generated types yet (migration 20261013000005).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db as any).rpc('hospital_receive_transport', {
    p_request_id: body.requestId,
    p_hospital_id: caller.hospitalId,
    p_actor_user_id: me?.id ?? null,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'This ambulance is not arriving at your hospital, or the trip is already closed.' }, { status: 409 })
  return NextResponse.json({ ok: true })
}
