import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/supabase/auth-server'
import { Errors } from '@/lib/api-error'

// POST /api/hospitals/[id]/specialties -- replaces admin-api.ts's
// addHospitalSpecialty (Task 15).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(['super_admin', 'hospital_admin', 'clinic_admin', 'front_desk'])
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  const { id: hospitalId } = await params
  if (caller.role !== 'super_admin' && caller.hospitalId !== hospitalId) return Errors.forbidden()
  const db = createAdminClient()

  const { specialtyId } = await req.json()
  if (!specialtyId) return Errors.validation('specialtyId is required')

  const { error } = await db.from('hospital_specialties').insert({ hospital_id: hospitalId, specialty_id: specialtyId })
  if (error) return Errors.internal(error.message)
  return NextResponse.json({ success: true })
}
