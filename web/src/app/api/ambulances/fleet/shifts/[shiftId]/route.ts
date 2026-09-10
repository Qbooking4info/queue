import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole } from '@/lib/supabase/auth-server'
import { resolveProviderId, assertOwnShift } from '@/lib/ambulance-fleet'
import { Errors } from '@/lib/api-error'
import { AUTH_CORS_HEADERS, corsOptions } from '@/lib/cors'

export async function OPTIONS() {
  return corsOptions()
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

  const { error } = await db.from('ambulance_shifts').delete().eq('id', shiftId)
  if (error) return Errors.internal(error.message)
  return NextResponse.json({ success: true })
}
