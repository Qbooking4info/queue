import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole } from '@/lib/supabase/auth-server'
import { Errors } from '@/lib/api-error'
import { assertOwnShift } from '@/lib/ambulance-fleet'

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ shiftId: string }> }) {
  const auth = await requireRole(['hospital_admin'], req)
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  if (!caller.hospitalId) return Errors.forbidden()
  const { shiftId } = await params
  const db = createAdminClient()

  if (!(await assertOwnShift(db, shiftId, caller.hospitalId))) return Errors.notFound('Shift')

  const { error } = await db.from('ambulance_shifts').delete().eq('id', shiftId)
  if (error) return Errors.internal(error.message)
  return NextResponse.json({ success: true })
}
