import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { PUBLIC_CORS_HEADERS } from '@/lib/public-hospital-select'

// Unauthenticated directory of every registered, active doctor -- not just the
// subset who opted into direct (no-hospital) bookings. Source of truth is
// `doctors` (one row per hospital affiliation, guaranteed for every
// hospital-linked doctor) grouped by user_id into one entry per person, with
// each doctor's hospital(s) listed; doctor_profiles (only guaranteed to exist
// for doctors who've touched direct-booking settings) is joined in on top for
// fee/bio/direct-booking capability where it exists. A doctor with zero
// doctor_profiles row still shows up here -- they just can't be booked
// directly, only via one of their hospitals.
export async function OPTIONS() {
  return NextResponse.json({}, { headers: PUBLIC_CORS_HEADERS })
}

export async function GET(req: NextRequest) {
  const db = createAdminClient()
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim() ?? ''
  const specialtyId = searchParams.get('specialtyId')
  const visitType = searchParams.get('visitType') // 'virtual' | 'home_visit' | null (no direct-booking filter)

  let query = db
    .from('doctors')
    .select(
      'user_id, full_name, title, level, avatar_url, ' +
      'hospital:hospitals!doctors_hospital_id_fkey(id, name), ' +
      'specialty:specialties!doctors_specialty_id_fkey(name, icon)',
    )
    .eq('is_active', true)
    .not('user_id', 'is', null)

  if (specialtyId) query = query.eq('specialty_id', specialtyId)

  const { data: rows, error } = await query.order('full_name').limit(300)
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: PUBLIC_CORS_HEADERS })

  const userIds = [...new Set((rows ?? []).map((r: any) => r.user_id as string))]
  const emptyIds = ['00000000-0000-0000-0000-000000000000']

  const [{ data: profiles }, { data: users }] = await Promise.all([
    db.from('doctor_profiles')
      .select('user_id, bio, qualification, years_experience, virtual_fee, home_visit_fee, accepts_direct_virtual, accepts_direct_home_visit, show_phone_to_patients')
      .in('user_id', userIds.length ? userIds : emptyIds),
    db.from('users').select('id, phone').in('id', userIds.length ? userIds : emptyIds),
  ])

  const profileByUser = new Map((profiles ?? []).map((p: any) => [p.user_id, p]))
  const phoneByUser = new Map((users ?? []).map((u: any) => [u.id, u.phone as string | null]))

  // One entry per doctor identity -- hospitals aggregated, not one row per link.
  const byUser = new Map<string, any>()
  for (const r of (rows ?? []) as any[]) {
    const hospitalEntry = r.hospital ? { id: r.hospital.id, name: r.hospital.name } : null
    const existing = byUser.get(r.user_id)
    if (existing) {
      if (hospitalEntry && !existing.hospitals.some((h: any) => h.id === hospitalEntry.id)) {
        existing.hospitals.push(hospitalEntry)
      }
    } else {
      byUser.set(r.user_id, {
        userId: r.user_id,
        fullName: r.full_name,
        avatarUrl: r.avatar_url,
        title: r.title,
        level: r.level,
        specialty: r.specialty ?? null,
        hospitals: hospitalEntry ? [hospitalEntry] : [],
      })
    }
  }

  let doctors = Array.from(byUser.values()).map(d => {
    const profile: any = profileByUser.get(d.userId)
    return {
      ...d,
      bio: profile?.bio ?? null,
      qualification: profile?.qualification ?? null,
      yearsExperience: profile?.years_experience ?? null,
      virtualFee: profile?.accepts_direct_virtual ? profile.virtual_fee : null,
      homeVisitFee: profile?.accepts_direct_home_visit ? profile.home_visit_fee : null,
      acceptsDirectVirtual: profile?.accepts_direct_virtual ?? false,
      acceptsDirectHomeVisit: profile?.accepts_direct_home_visit ?? false,
      phone: profile?.show_phone_to_patients ? (phoneByUser.get(d.userId) ?? null) : null,
    }
  })

  if (visitType === 'virtual') doctors = doctors.filter(d => d.acceptsDirectVirtual)
  else if (visitType === 'home_visit') doctors = doctors.filter(d => d.acceptsDirectHomeVisit)

  if (q) {
    const needle = q.toLowerCase()
    doctors = doctors.filter(d =>
      d.fullName.toLowerCase().includes(needle) || d.specialty?.name?.toLowerCase().includes(needle))
  }

  return NextResponse.json({ doctors }, { headers: PUBLIC_CORS_HEADERS })
}
