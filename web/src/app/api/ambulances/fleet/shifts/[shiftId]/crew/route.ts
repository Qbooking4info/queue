import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole } from '@/lib/supabase/auth-server'
import { Errors } from '@/lib/api-error'
import { assertOwnShift } from '@/lib/ambulance-fleet'

export async function POST(req: NextRequest, { params }: { params: Promise<{ shiftId: string }> }) {
  const auth = await requireRole(['hospital_admin'], req)
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  if (!caller.hospitalId) return Errors.forbidden()
  const { shiftId } = await params
  const db = createAdminClient()

  if (!(await assertOwnShift(db, shiftId, caller.hospitalId))) return Errors.notFound('Shift')

  const { hospitalAdminId } = await req.json()
  if (!hospitalAdminId) return Errors.validation('hospitalAdminId is required')

  const { data: crewRow } = await db.from('hospital_admins')
    .select('id')
    .eq('id', hospitalAdminId)
    .eq('hospital_id', caller.hospitalId)
    .eq('role', 'ambulance_crew')
    .eq('is_active', true)
    .maybeSingle()
  if (!crewRow) return Errors.validation('Not a valid crew member for this hospital')

  const { error } = await db.from('ambulance_shift_crew').insert({ shift_id: shiftId, hospital_admin_id: hospitalAdminId })
  if (error) return Errors.internal(error.message)
  return NextResponse.json({ success: true }, { status: 201 })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ shiftId: string }> }) {
  const auth = await requireRole(['hospital_admin'], req)
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  if (!caller.hospitalId) return Errors.forbidden()
  const { shiftId } = await params
  const db = createAdminClient()

  if (!(await assertOwnShift(db, shiftId, caller.hospitalId))) return Errors.notFound('Shift')

  const hospitalAdminId = new URL(req.url).searchParams.get('hospitalAdminId')
  if (!hospitalAdminId) return Errors.validation('hospitalAdminId is required')

  const { error } = await db.from('ambulance_shift_crew')
    .delete()
    .eq('shift_id', shiftId)
    .eq('hospital_admin_id', hospitalAdminId)
  if (error) return Errors.internal(error.message)
  return NextResponse.json({ success: true })
}
