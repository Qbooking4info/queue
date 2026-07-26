import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/supabase/auth-server'
import { Errors } from '@/lib/api-error'

// DELETE /api/clinics/[clinicId]/doctors/[doctorId] -- replaces admin-api.ts's
// removeDoctorFromClinic (Task 15). Verifies the doctor is actually assigned
// to this clinic, and this clinic belongs to the caller's hospital, before
// unassigning.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ clinicId: string; doctorId: string }> }) {
  const auth = await requireRole(['super_admin', 'hospital_admin', 'clinic_admin'])
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  const { clinicId, doctorId } = await params
  const db = createAdminClient()

  const { data: doctor } = await db.from('doctors').select('hospital_id, clinic_id').eq('id', doctorId).single()
  if (!doctor || doctor.clinic_id !== clinicId) return Errors.notFound('Doctor')
  if (caller.role !== 'super_admin' && caller.hospitalId !== doctor.hospital_id) return Errors.forbidden()
  if (caller.role === 'clinic_admin' && caller.clinicId && caller.clinicId !== clinicId) return Errors.forbidden()

  const { error } = await db.from('doctors').update({ clinic_id: null }).eq('id', doctorId)
  if (error) return Errors.internal(error.message)
  return NextResponse.json({ success: true })
}
