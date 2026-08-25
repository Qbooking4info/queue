import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { PUBLIC_CORS_HEADERS } from '@/lib/public-hospital-select'

const BUCKET = 'doctor-credentials'
const SIGNED_URL_TTL_SECS = 300

// `id` here is the doctor's users.id (their "Doctor ID" -- same value shown
// to them in the doctors app and used by hospitals to link them). Public
// profile for any registered, active doctor -- not just ones accepting direct
// bookings. Doctors who haven't opted into direct booking still get a full
// profile (name, title, specialty, hospital affiliations); their fee/bio/
// documents are only populated when a doctor_profiles row exists and the
// relevant accepts_direct_* flag is on. Booking-flow decisions (direct vs.
// "go through a hospital") are the caller's to make from acceptsDirectVirtual/
// acceptsDirectHomeVisit and hospitals being present.
export async function OPTIONS() {
  return NextResponse.json({}, { headers: PUBLIC_CORS_HEADERS })
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = createAdminClient()

  const { data: user } = await db.from('users').select('id, full_name, avatar_url, phone').eq('id', id).single()
  if (!user) return NextResponse.json({ error: 'Doctor not found' }, { status: 404, headers: PUBLIC_CORS_HEADERS })

  type ProfileRow = {
    title: string | null; level: string | null; specialty_id: string | null; bio: string | null
    qualification: string | null; years_experience: number | null
    virtual_fee: number | null; home_visit_fee: number | null
    accepts_direct_virtual: boolean; accepts_direct_home_visit: boolean
    show_phone_to_patients: boolean
    specialty: { name: string; icon: string | null } | null
  }

  const profileQuery = db.from('doctor_profiles')
    .select(
      'title, level, specialty_id, bio, qualification, years_experience, ' +
      'virtual_fee, home_visit_fee, accepts_direct_virtual, accepts_direct_home_visit, ' +
      'show_phone_to_patients, specialty:specialties!doctor_profiles_specialty_id_fkey(name, icon)',
    )
    .eq('user_id', id)
    .maybeSingle() as unknown as PromiseLike<{ data: ProfileRow | null }>

  const doctorRowsQuery = db.from('doctors')
    .select('title, level, qualification, years_experience, hospital:hospitals!doctors_hospital_id_fkey(id, name), specialty:specialties!doctors_specialty_id_fkey(name, icon)')
    .eq('user_id', id)
    .eq('is_active', true)
    .order('created_at', { ascending: true })

  const [{ data: profile }, { data: doctorRows }] = await Promise.all([profileQuery, doctorRowsQuery])

  // Not registered anywhere at all -- no doctor_profiles row and no active
  // hospital link. Distinct from "registered but hasn't opted into direct
  // booking", which is a normal, fully valid state now.
  if (!profile && (!doctorRows || doctorRows.length === 0)) {
    return NextResponse.json({ error: 'Doctor not found' }, { status: 404, headers: PUBLIC_CORS_HEADERS })
  }

  const earliestHospitalRow = doctorRows?.[0] as any
  const hospitals = (doctorRows ?? [])
    .map((r: any) => r.hospital)
    .filter((h: any, i: number, arr: any[]) => h && arr.findIndex(x => x?.id === h.id) === i)

  const { data: docs } = await db
    .from('doctor_qualification_documents')
    .select('id, title, file_path')
    .eq('user_id', id)
    .order('uploaded_at', { ascending: false })

  const documents = await Promise.all((docs ?? []).map(async d => {
    const { data: signed } = await db.storage.from(BUCKET).createSignedUrl(d.file_path, SIGNED_URL_TTL_SECS)
    return { id: d.id, title: d.title, url: signed?.signedUrl ?? null }
  }))

  const acceptsDirectVirtual = profile?.accepts_direct_virtual ?? false
  const acceptsDirectHomeVisit = profile?.accepts_direct_home_visit ?? false

  return NextResponse.json({
    doctor: {
      userId: user.id,
      fullName: user.full_name ?? 'Doctor',
      avatarUrl: user.avatar_url ?? null,
      title: profile?.title ?? earliestHospitalRow?.title ?? null,
      level: profile?.level ?? earliestHospitalRow?.level ?? null,
      specialty: profile?.specialty ?? earliestHospitalRow?.specialty ?? null,
      bio: profile?.bio ?? null,
      qualification: profile?.qualification ?? earliestHospitalRow?.qualification ?? null,
      yearsExperience: profile?.years_experience ?? earliestHospitalRow?.years_experience ?? null,
      hospitals,
      virtualFee: acceptsDirectVirtual ? profile?.virtual_fee ?? null : null,
      homeVisitFee: acceptsDirectHomeVisit ? profile?.home_visit_fee ?? null : null,
      acceptsDirectVirtual,
      acceptsDirectHomeVisit,
      phone: profile?.show_phone_to_patients ? (user.phone ?? null) : null,
      documents,
    },
  }, { headers: PUBLIC_CORS_HEADERS })
}
