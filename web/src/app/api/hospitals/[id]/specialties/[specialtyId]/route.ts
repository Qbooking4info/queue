import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/supabase/auth-server'
import { Errors } from '@/lib/api-error'

// DELETE /api/hospitals/[id]/specialties/[specialtyId] -- replaces
// admin-api.ts's removeHospitalSpecialty (Task 15).
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; specialtyId: string }> }) {
  const auth = await requireRole(['super_admin', 'hospital_admin', 'clinic_admin', 'front_desk'])
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  const { id: hospitalId, specialtyId } = await params
  if (caller.role !== 'super_admin' && caller.hospitalId !== hospitalId) return Errors.forbidden()
  const db = createAdminClient()

  const { error } = await db.from('hospital_specialties').delete().eq('hospital_id', hospitalId).eq('specialty_id', specialtyId)
  if (error) return Errors.internal(error.message)
  return NextResponse.json({ success: true })
}
