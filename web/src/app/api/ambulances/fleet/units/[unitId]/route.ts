import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole } from '@/lib/supabase/auth-server'
import { resolveProviderId, assertOwnAmbulance } from '@/lib/ambulance-fleet'
import { Errors } from '@/lib/api-error'
import { AUTH_CORS_HEADERS, corsOptions } from '@/lib/cors'

export async function OPTIONS() {
  return corsOptions()
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ unitId: string }> }) {
  const res = await handleDELETE(req, { params })
  for (const [k, v] of Object.entries(AUTH_CORS_HEADERS)) res.headers.set(k, v)
  return res
}

async function handleDELETE(req: NextRequest, { params }: { params: Promise<{ unitId: string }> }) {
  const auth = await requireRole(['ambulance_admin'], req)
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  const { unitId } = await params
  const db = createAdminClient()

  const providerId = await resolveProviderId(caller, db)
  if (!providerId || !(await assertOwnAmbulance(db, unitId, providerId))) return Errors.notFound('Ambulance')

  // Blocked by ON DELETE RESTRICT if this unit is currently on an active job — that's
  // the correct behaviour, not a bug to work around.
  const { error } = await db.from('ambulances').delete().eq('id', unitId)
  if (error) return Errors.internal(error.message)
  return NextResponse.json({ success: true })
}
