import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole } from '@/lib/supabase/auth-server'
import { resolveProviderId, assertOwnShift } from '@/lib/ambulance-fleet'
import { Errors } from '@/lib/api-error'
import { AUTH_CORS_HEADERS, corsOptions } from '@/lib/cors'

export async function OPTIONS() {
  return corsOptions()
}

/**
 * POST/DELETE /api/ambulances/fleet/shifts/[shiftId]/crew
 *
 * Attaches or detaches a crew member from a shift. Every provider's crew --
 * hospital-owned or independent -- lives in ambulance_crew now (added via
 * POST /api/ambulances/fleet/crew), so this only ever writes
 * ambulance_shift_crew.crew_member_id. hospital_admin_id is still a column
 * on that table (old rows, and RLS policies from 20260730000001 that read
 * it), just never written by this route.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ shiftId: string }> }) {
  const res = await handlePOST(req, ctx)
  for (const [k, v] of Object.entries(AUTH_CORS_HEADERS)) res.headers.set(k, v)
  return res
}

async function handlePOST(req: NextRequest, { params }: { params: Promise<{ shiftId: string }> }) {
  const auth = await requireRole(['ambulance_admin'], req)
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  const { shiftId } = await params
  const db = createAdminClient()

  const providerId = await resolveProviderId(caller, db)
  if (!providerId || !(await assertOwnShift(db, shiftId, providerId))) return Errors.notFound('Shift')

  const body = await req.json().catch(() => null) as { crewMemberId?: string } | null
  const crewMemberId = body?.crewMemberId
  if (!crewMemberId) return Errors.validation('crewMemberId is required')

  const { data: crewRow } = await db.from('ambulance_crew')
    .select('id')
    .eq('id', crewMemberId)
    .eq('provider_id', providerId)
    .eq('is_active', true)
    .maybeSingle()
  if (!crewRow) return Errors.validation('Not a valid crew member for this fleet')

  const { error } = await db.from('ambulance_shift_crew').insert({ shift_id: shiftId, crew_member_id: crewMemberId })
  if (error) return Errors.internal(error.message)

  return NextResponse.json({ success: true }, { status: 201 })
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ shiftId: string }> }) {
  const res = await handleDELETE(req, ctx)
  for (const [k, v] of Object.entries(AUTH_CORS_HEADERS)) res.headers.set(k, v)
  return res
}

async function handleDELETE(req: NextRequest, { params }: { params: Promise<{ shiftId: string }> }) {
  const auth = await requireRole(['ambulance_admin'], req)
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  const { shiftId } = await params
  const db = createAdminClient()

  const providerId = await resolveProviderId(caller, db)
  if (!providerId || !(await assertOwnShift(db, shiftId, providerId))) return Errors.notFound('Shift')

  const crewMemberId = new URL(req.url).searchParams.get('crewMemberId')
  if (!crewMemberId) return Errors.validation('crewMemberId is required')

  const { error } = await db.from('ambulance_shift_crew').delete().eq('shift_id', shiftId).eq('crew_member_id', crewMemberId)
  if (error) return Errors.internal(error.message)
  return NextResponse.json({ success: true })
}
