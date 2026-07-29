import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole } from '@/lib/supabase/auth-server'
import { Errors } from '@/lib/api-error'

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ unitId: string }> }) {
  const auth = await requireRole(['hospital_admin'], req)
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  if (!caller.hospitalId) return Errors.forbidden()
  const { unitId } = await params
  const db = createAdminClient()

  const { data: unit } = await db.from('ambulances')
    .select('id, ambulance_providers!inner(hospital_id)')
    .eq('id', unitId)
    .single()

  const provider = unit ? (Array.isArray(unit.ambulance_providers) ? unit.ambulance_providers[0] : unit.ambulance_providers) : null
  if (!provider || provider.hospital_id !== caller.hospitalId) return Errors.notFound('Ambulance')

  // Blocked by ON DELETE RESTRICT if this unit is currently on an active job — that's
  // the correct behaviour, not a bug to work around.
  const { error } = await db.from('ambulances').delete().eq('id', unitId)
  if (error) return Errors.internal(error.message)
  return NextResponse.json({ success: true })
}
