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

  const body = await req.json() as Record<string, unknown>

  // Whitelisted rather than passing `body` straight through: the type annotation
  // is erased at runtime, so any extra key the client sent — hospital_id and
  // clinic_id in particular — was written verbatim, letting a caller move a
  // service to a hospital they don't own after the ownership check had passed.
  const EDITABLE = ['name', 'description', 'specialty_id', 'base_price', 'virtual_price', 'duration_mins', 'is_active'] as const
  const updates: Record<string, unknown> = {}
  for (const key of EDITABLE) {
    if (body[key] !== undefined) updates[key] = body[key]
  }
  if (Object.keys(updates).length === 0) return Errors.validation('No valid fields to update')

  const { error } = await db.from('services').update(updates as any).eq('id', serviceId)
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
