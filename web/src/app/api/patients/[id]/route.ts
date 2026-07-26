import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/supabase/auth-server'
import { Errors } from '@/lib/api-error'

export interface PatientProfile {
  id: string
  full_name: string
  date_of_birth: string | null
  gender: string | null
  blood_group: string | null
  phone: string | null
  email: string | null
  city: string | null
  state: string | null
}

export interface PatientMedicalHistory {
  conditions: string[]
  allergies: string[]
  medications: string | null
  surgeries: string | null
  family_history: string | null
  other_conditions: string | null
  other_allergies: string | null
  updated_at: string | null
}

// GET a patient's profile + medical history for the dashboard chart view
// (Task 15, replacing ViewPatientModal's direct admin-api.ts/adminDb calls).
//
// patient_medical_history's only RLS policy is "patients manage their own
// medical history" -- there is no staff-read policy, so this authorization
// check has to happen here, in the one place server-side code is allowed to
// use the service-role client. Scoped the same way Task 3's staff-read
// policy was reasoned about: staff may view a patient's chart only if that
// patient has an appointment at the caller's hospital.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(['super_admin', 'hospital_admin', 'clinic_admin', 'front_desk', 'doctor'])
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  const { id: patientId } = await params
  const db = createAdminClient()

  if (caller.role !== 'super_admin') {
    const { count } = await db
      .from('appointments')
      .select('*', { count: 'exact', head: true })
      .eq('patient_id', patientId)
      .eq('hospital_id', caller.hospitalId ?? '')
    if (!count) return Errors.forbidden('No relationship with this patient')
  }

  const [{ data: profile }, { data: history }] = await Promise.all([
    db
      .from('users')
      .select('id, full_name, date_of_birth, gender, blood_group, phone, email, city, state')
      .eq('id', patientId)
      .single(),
    (db as any)
      .from('patient_medical_history')
      .select('conditions, allergies, medications, surgeries, family_history, other_conditions, other_allergies, updated_at')
      .eq('patient_id', patientId)
      .maybeSingle(),
  ])

  if (!profile) return Errors.notFound('Patient')

  return NextResponse.json({
    profile: profile as PatientProfile,
    history: (history as PatientMedicalHistory | null) ?? null,
  })
}
