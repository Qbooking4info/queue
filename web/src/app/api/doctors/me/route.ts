import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/supabase/auth-server'
import { Errors } from '@/lib/api-error'

// Doctor self-service: their own average consult duration (Task 15,
// replacing admin-api.ts's getDoctorAvgConsultDuration) and their own
// availability status (replacing setDoctorAvailability). Both keyed on
// caller.doctorId from the server-verified session -- never a client-
// supplied doctorId, so a doctor can only ever read/change their own row.
export async function GET() {
  const auth = await requireRole(['doctor'])
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  if (!caller.doctorId) return Errors.forbidden()
  const db = createAdminClient()

  const { data } = await db
    .from('appointments')
    .select('consult_duration_secs')
    .eq('doctor_id', caller.doctorId)
    .not('consult_duration_secs', 'is', null)

  if (!data || data.length === 0) return NextResponse.json({ avgConsultSecs: null })
  const total = (data as { consult_duration_secs: number }[]).reduce((sum: number, r) => sum + r.consult_duration_secs, 0)
  return NextResponse.json({ avgConsultSecs: total / data.length })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireRole(['doctor'])
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  if (!caller.doctorId) return Errors.forbidden()
  const db = createAdminClient()

  const { availability_status } = await req.json()
  if (!['on_duty', 'on_break', 'off_duty'].includes(availability_status)) {
    return Errors.validation('Invalid availability_status')
  }

  const { error } = await (db.from('doctors') as any)
    .update({ availability_status })
    .eq('id', caller.doctorId)
  if (error) return Errors.internal(error.message)
  return NextResponse.json({ success: true })
}
