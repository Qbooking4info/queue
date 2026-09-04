import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/supabase/auth-server'
import { Errors } from '@/lib/api-error'
import { AUTH_CORS_HEADERS, corsOptions } from '@/lib/cors'
import { setActiveClinic } from '@/lib/doctor-clinics'

// Self-service clinic switching for a doctor assigned to multiple clinics at
// their currently-active hospital (doctor_clinics, 20260903000001) --
// mirrors switchHospital's self-service spirit, but as a small API route
// rather than a direct RLS-guarded client write: unlike
// users.active_hospital_id, doctors has no RLS UPDATE policy for regular
// users at all today, and every other doctor-row mutation in this codebase
// (PATCH /api/doctors/me, POST /api/doctors/link, ...) already goes through
// a service-role route, so this stays consistent with that rather than
// introducing a first RLS write path on doctors.
//
// Called cross-origin by the Queue Doctor app (localhost:8095 -> localhost:3000)
// -- needs real CORS handling, same as doctors/me/route.ts.
export async function OPTIONS() {
  return corsOptions()
}

export async function PATCH(req: NextRequest) {
  const res = await handlePATCH(req)
  for (const [k, v] of Object.entries(AUTH_CORS_HEADERS)) res.headers.set(k, v)
  return res
}

async function handlePATCH(req: NextRequest) {
  const auth = await requireRole(['doctor'], req)
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  if (!caller.doctorId) return Errors.forbidden()

  const { clinicId } = await req.json()
  if (!clinicId) return Errors.validation('clinicId is required')

  const db = createAdminClient()
  const result = await setActiveClinic(db, caller.doctorId, clinicId)
  if (!result.ok) return result.notMember ? Errors.validation(result.message) : Errors.internal(result.message)
  return NextResponse.json({ success: true })
}
