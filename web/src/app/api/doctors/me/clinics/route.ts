import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/supabase/auth-server'
import { Errors } from '@/lib/api-error'
import { AUTH_CORS_HEADERS, corsOptions } from '@/lib/cors'

// GET /api/doctors/me/clinics -- the caller's own assigned-clinics pool at
// their currently-active hospital (doctor_clinics, 20260903000001), plus
// which one is currently active. Drives the doctor app's own clinic
// switcher (DoctorHospitalsScreen) -- kept behind a route rather than direct
// client reads since nothing else reads doctor_clinics from the client side
// either (see the migration's no-anon-grant note).
//
// Called cross-origin by the Queue Doctor app (localhost:8095 -> localhost:3000).
export async function OPTIONS() {
  return corsOptions()
}

export async function GET(req: NextRequest) {
  const res = await handleGET(req)
  for (const [k, v] of Object.entries(AUTH_CORS_HEADERS)) res.headers.set(k, v)
  return res
}

async function handleGET(req: NextRequest) {
  const auth = await requireRole(['doctor'], req)
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  if (!caller.doctorId) return Errors.forbidden()
  const db = createAdminClient()

  const [{ data: memberRows }, { data: doctorRow }] = await Promise.all([
    db.from('doctor_clinics')
      .select('clinic_id, clinic:hospital_clinics!doctor_clinics_clinic_id_fkey(name)')
      .eq('doctor_id', caller.doctorId),
    db.from('doctors').select('clinic_id').eq('id', caller.doctorId).single(),
  ])

  return NextResponse.json({
    activeClinicId: doctorRow?.clinic_id ?? null,
    clinics: ((memberRows ?? []) as any[]).map(r => ({
      clinicId: r.clinic_id,
      clinicName: (Array.isArray(r.clinic) ? r.clinic[0]?.name : r.clinic?.name) ?? 'Clinic',
    })),
  })
}
