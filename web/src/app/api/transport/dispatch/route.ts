import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/supabase/auth-server'
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

  const { requestId, round = 1 } = await req.json()
  if (!requestId) return Errors.validation('requestId is required')

  try {
    const result = await runDispatchRound(requestId, round)
    return NextResponse.json(result)
  } catch (err) {
    console.error('[transport] dispatch round failed', requestId, round, err)
    return Errors.internal('Dispatch failed')
  }
}
