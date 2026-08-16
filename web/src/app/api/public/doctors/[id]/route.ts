import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { PUBLIC_CORS_HEADERS } from '@/lib/public-hospital-select'

const BUCKET = 'doctor-credentials'
const SIGNED_URL_TTL_SECS = 300

// `id` here is the doctor's users.id (their "Doctor ID" -- same value shown
// to them in the doctors app and used by hospitals to link them). Public
// profile detail for direct booking: fee, bio, qualifications, and uploaded
// credential documents via short-lived signed URLs (bucket is private).
export async function OPTIONS() {
  return NextResponse.json({}, { headers: PUBLIC_CORS_HEADERS })
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = createAdminClient()

  const { data: profile } = await db
    .from('doctor_profiles')
    .select(
      'user_id, title, specialty_id, bio, qualification, years_experience, ' +
      'virtual_fee, home_visit_fee, accepts_direct_virtual, accepts_direct_home_visit, ' +
      'show_phone_to_patients, ' +
      'user:users!doctor_profiles_user_id_fkey(full_name, avatar_url, phone), ' +
      'specialty:specialties!doctor_profiles_specialty_id_fkey(name, icon)',
    )
    .eq('user_id', id)
    .single() as { data: {
      user_id: string; title: string | null; specialty_id: string | null; bio: string | null
      qualification: string | null; years_experience: number | null
      virtual_fee: number | null; home_visit_fee: number | null
      accepts_direct_virtual: boolean; accepts_direct_home_visit: boolean
      show_phone_to_patients: boolean
      user: { full_name: string; avatar_url: string | null; phone: string | null } | null
      specialty: { name: string; icon: string | null } | null
    } | null }

  if (!profile) return NextResponse.json({ error: 'Doctor not found' }, { status: 404, headers: PUBLIC_CORS_HEADERS })
  if (!profile.accepts_direct_virtual && !profile.accepts_direct_home_visit) {
    return NextResponse.json({ error: 'Doctor not found' }, { status: 404, headers: PUBLIC_CORS_HEADERS })
  }

  const { data: docs } = await db
    .from('doctor_qualification_documents')
    .select('id, title, file_path')
    .eq('user_id', id)
    .order('uploaded_at', { ascending: false })

  const documents = await Promise.all((docs ?? []).map(async d => {
    const { data: signed } = await db.storage.from(BUCKET).createSignedUrl(d.file_path, SIGNED_URL_TTL_SECS)
    return { id: d.id, title: d.title, url: signed?.signedUrl ?? null }
  }))

  const user = profile.user
  return NextResponse.json({
    doctor: {
      userId: profile.user_id,
      fullName: user?.full_name ?? 'Doctor',
      avatarUrl: user?.avatar_url ?? null,
      title: profile.title,
      specialty: profile.specialty ?? null,
      bio: profile.bio,
      qualification: profile.qualification,
      yearsExperience: profile.years_experience,
      virtualFee: profile.accepts_direct_virtual ? profile.virtual_fee : null,
      homeVisitFee: profile.accepts_direct_home_visit ? profile.home_visit_fee : null,
      acceptsDirectVirtual: profile.accepts_direct_virtual,
      acceptsDirectHomeVisit: profile.accepts_direct_home_visit,
      phone: profile.show_phone_to_patients ? (user?.phone ?? null) : null,
      documents,
    },
  }, { headers: PUBLIC_CORS_HEADERS })
}
