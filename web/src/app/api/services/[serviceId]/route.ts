import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/supabase/auth-server'
import { Errors } from '@/lib/api-error'

async function assertOwnService(
  db: ReturnType<typeof createAdminClient>,
  caller: { role: string; hospitalId?: string },
  serviceId: string,
): Promise<boolean> {
  const { data: service } = await db.from('services').select('hospital_id').eq('id', serviceId).single()
  if (!service) return false
  return caller.role === 'super_admin' || caller.hospitalId === service.hospital_id
}

// PATCH/DELETE /api/services/[serviceId] -- replaces admin-api.ts's
// updateService/toggleServiceActive/deleteService (Task 15). Verifies the
// service belongs to the caller's hospital before any write.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ serviceId: string }> }) {
  const auth = await requireRole(['super_admin', 'hospital_admin', 'clinic_admin', 'front_desk'])
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  const { serviceId } = await params
  const db = createAdminClient()

  if (!(await assertOwnService(db, caller, serviceId))) return Errors.forbidden()

  const body = await req.json() as {
    name?: string; description?: string | null; specialty_id?: string | null
    base_price?: number | null; virtual_price?: number | null; duration_mins?: number | null
    is_active?: boolean
  }
  const { error } = await db.from('services').update(body as any).eq('id', serviceId)
  if (error) return Errors.internal(error.message)
  return NextResponse.json({ success: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ serviceId: string }> }) {
  const auth = await requireRole(['super_admin', 'hospital_admin', 'clinic_admin', 'front_desk'])
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  const { serviceId } = await params
  const db = createAdminClient()

  if (!(await assertOwnService(db, caller, serviceId))) return Errors.forbidden()

  const { error } = await db.from('services').delete().eq('id', serviceId)
  if (error) return Errors.internal(error.message)
  return NextResponse.json({ success: true })
}
