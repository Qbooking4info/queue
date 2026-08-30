import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/supabase/auth-server'
import { Errors } from '@/lib/api-error'

type Body = { mode: 'assign'; doctorId: string }

// POST /api/clinics/[clinicId]/doctors -- replaces admin-api.ts's
// assignDoctorToClinic (Task 15). Verifies the clinic belongs to the caller's
// hospital before assigning. The sibling createClinicDoctor ('mode: create',
// manually inserting a brand-new doctors row) was removed 20260826 -- every
// doctor is now added via POST /api/doctors/link (ID-based) instead, the same
// change that removed the standalone "+ Invite Doctor" flow.
export async function POST(req: NextRequest, { params }: { params: Promise<{ clinicId: string }> }) {
  const auth = await requireRole(['super_admin', 'hospital_admin', 'clinic_admin'])
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  const { clinicId } = await params
  const db = createAdminClient()

  const { data: clinic } = await db.from('hospital_clinics').select('hospital_id').eq('id', clinicId).single()
  if (!clinic) return Errors.notFound('Clinic')
  if (caller.role !== 'super_admin' && caller.hospitalId !== clinic.hospital_id) return Errors.forbidden()
  if (caller.role === 'clinic_admin' && caller.clinicId && caller.clinicId !== clinicId) return Errors.forbidden()

  const body = (await req.json()) as Body

  const { data: doctor } = await db.from('doctors').select('hospital_id').eq('id', body.doctorId).single()
  if (!doctor || doctor.hospital_id !== clinic.hospital_id) return Errors.validation('Doctor does not belong to this hospital')
  const { error } = await db.from('doctors').update({ clinic_id: clinicId }).eq('id', body.doctorId)
  if (error) return Errors.internal(error.message)
  return NextResponse.json({ success: true })
}
