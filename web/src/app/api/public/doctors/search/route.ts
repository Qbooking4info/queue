import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { PUBLIC_CORS_HEADERS } from '@/lib/public-hospital-select'

// Unauthenticated directory of doctors accepting DIRECT bookings (no hospital
// involved) -- the hospital-scoped doctor directory (HOSPITAL_SELECT's
// embedded doctors()) is a separate, existing thing. Only surfaces doctors
// who opted in via doctor_profiles.accepts_direct_virtual/home_visit; phone
// is redacted server-side unless the doctor turned on show_phone_to_patients
// -- never trust a client-supplied flag to decide what leaves the server.
export async function OPTIONS() {
  return NextResponse.json({}, { headers: PUBLIC_CORS_HEADERS })
}

export async function GET(req: NextRequest) {
  const db = createAdminClient()
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim() ?? ''
  const specialtyId = searchParams.get('specialtyId')
  const visitType = searchParams.get('visitType') // 'virtual' | 'home_visit' | null (either)

  let query = db
    .from('doctor_profiles')
    .select(
      'user_id, title, specialty_id, bio, qualification, years_experience, ' +
      'virtual_fee, home_visit_fee, accepts_direct_virtual, accepts_direct_home_visit, ' +
      'show_phone_to_patients, ' +
      'user:users!doctor_profiles_user_id_fkey(full_name, avatar_url, phone), ' +
      'specialty:specialties!doctor_profiles_specialty_id_fkey(name, icon)',
    )

  if (visitType === 'virtual') query = query.eq('accepts_direct_virtual', true)
  else if (visitType === 'home_visit') query = query.eq('accepts_direct_home_visit', true)
  else query = query.or('accepts_direct_virtual.eq.true,accepts_direct_home_visit.eq.true')

  if (specialtyId) query = query.eq('specialty_id', specialtyId)

  const { data, error } = await query.limit(50)
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: PUBLIC_CORS_HEADERS })

  let doctors = (data ?? []).map((d: any) => ({
    userId: d.user_id,
    fullName: d.user?.full_name ?? 'Doctor',
    avatarUrl: d.user?.avatar_url ?? null,
    title: d.title,
    specialty: d.specialty ?? null,
    bio: d.bio,
    qualification: d.qualification,
    yearsExperience: d.years_experience,
    virtualFee: d.accepts_direct_virtual ? d.virtual_fee : null,
    homeVisitFee: d.accepts_direct_home_visit ? d.home_visit_fee : null,
    acceptsDirectVirtual: d.accepts_direct_virtual,
    acceptsDirectHomeVisit: d.accepts_direct_home_visit,
    phone: d.show_phone_to_patients ? (d.user?.phone ?? null) : null,
  }))

  if (q) {
    const needle = q.toLowerCase()
    doctors = doctors.filter(d =>
      d.fullName.toLowerCase().includes(needle) || d.specialty?.name?.toLowerCase().includes(needle))
  }

  return NextResponse.json({ doctors }, { headers: PUBLIC_CORS_HEADERS })
}
