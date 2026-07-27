import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/supabase/auth-server'
import { Errors } from '@/lib/api-error'

export interface AppointmentVitals {
  weight_kg: number | null
  height_cm: number | null
  bp_systolic: number | null
  bp_diastolic: number | null
  blood_sugar: number | null
}

// POST records vitals for an appointment (Task 15, replacing VitalsModal's
// direct admin-api.ts/adminDb call). vitals_audit_log is the source of
// truth -- appointments no longer stores denormalized vitals columns
// (dropped in migration 20260719000004).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(['super_admin', 'hospital_admin', 'clinic_admin', 'front_desk', 'doctor'])
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  const { id: appointmentId } = await params
  const db = createAdminClient()

  const { data: appt } = await db
    .from('appointments')
    .select('id, hospital_id')
    .eq('id', appointmentId)
    .single()
  if (!appt) return Errors.notFound('Appointment')

  if (caller.role !== 'super_admin' && caller.hospitalId !== appt.hospital_id) {
    return Errors.forbidden("Cannot record vitals for another hospital's appointment")
  }

  const vitals = (await req.json()) as AppointmentVitals
  const bmi = vitals.weight_kg && vitals.height_cm && vitals.height_cm > 0
    ? Math.round((vitals.weight_kg / Math.pow(vitals.height_cm / 100, 2)) * 10) / 10
    : null

  // recorded_by_auth_id comes from the server-verified caller, not a
  // client-supplied value -- the previous client component passed its own
  // auth id as a prop, which is weaker than deriving it from the session
  // requireRole() already validated.
  const { error } = await db.from('vitals_audit_log').insert({
    appointment_id:      appointmentId,
    recorded_by_auth_id: caller.authId,
    recorded_at:         new Date().toISOString(),
    weight_kg:           vitals.weight_kg,
    height_cm:           vitals.height_cm,
    bp_systolic:         vitals.bp_systolic,
    bp_diastolic:        vitals.bp_diastolic,
    blood_sugar:         vitals.blood_sugar,
    bmi,
  })

  if (error) return Errors.internal(error.message)
  return NextResponse.json({ success: true })
}
