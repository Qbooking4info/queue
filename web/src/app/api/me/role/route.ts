import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  // 1. Identify the caller via their session cookie
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json(null, { status: 401 })

  const authId = user.id
  const db = createAdminClient() // service role — bypasses RLS

  // 2. Look up users row
  const { data: profile } = await db
    .from('users')
    .select('id, full_name, active_hospital_id')
    .eq('auth_id', authId)
    .single() as { data: { id: string; full_name: string | null; active_hospital_id: string | null } | null; error: unknown }

  if (profile) {
    const { data: paRow } = await db
      .from('platform_admins')
      .select('id')
      .eq('user_id', profile.id)
      .eq('is_active', true)
      .maybeSingle()
    if (paRow) {
      return NextResponse.json({ role: 'super_admin', displayName: profile.full_name })
    }

    // hospital_admins also holds 'specialist' and 'front_desk' login rows (from the doctor/
    // front-desk portal-account flows) — check the role column instead of treating any row
    // as an admin. 'specialist' falls through to the doctor lookup below.
    const { data: adminRow } = await db
      .from('hospital_admins')
      .select('hospital_id, role')
      .eq('user_id', profile.id)
      .limit(1)
      .single()
    if (adminRow && adminRow.role === 'front_desk') {
      return NextResponse.json({ role: 'front_desk', hospitalId: adminRow.hospital_id, displayName: profile.full_name })
    }
    if (adminRow && adminRow.role !== 'specialist') {
      return NextResponse.json({ role: 'hospital_admin', hospitalId: adminRow.hospital_id, displayName: profile.full_name })
    }

    const { data: clinicRow } = await db
      .from('clinic_admins')
      .select('hospital_id, clinic_id, role')
      .eq('user_id', profile.id)
      .eq('is_active', true)
      .limit(1)
      .single()
    if (clinicRow) {
      const r = (clinicRow.role ?? 'clinic_admin') as string
      const isFrontDesk = r === 'front_desk' || r === 'desk_officer'
      return NextResponse.json({
        role: isFrontDesk ? 'front_desk' : 'clinic_admin',
        hospitalId: clinicRow.hospital_id,
        clinicId: clinicRow.clinic_id ?? null,
        displayName: profile.full_name,
      })
    }
  }

  // 3. Doctor — portal-created accounts link via doctors.user_id; self-registered via
  // auth_user_id. One person can have multiple doctors rows (one per linked hospital,
  // see doctors/ app) -- active_hospital_id picks which; falls back to the earliest-
  // linked row if unset or stale.
  const orConditions = [`auth_user_id.eq.${authId}`]
  if (profile) orConditions.push(`user_id.eq.${profile.id}`)

  const { data: doctorRows } = await db
    .from('doctors')
    .select('id, hospital_id, full_name')
    .or(orConditions.join(','))
    .order('created_at', { ascending: true })
  if (doctorRows && doctorRows.length > 0) {
    const active = profile?.active_hospital_id
      ? doctorRows.find(d => d.hospital_id === profile.active_hospital_id)
      : undefined
    const doctorRow = active ?? doctorRows[0]
    return NextResponse.json({ role: 'doctor', hospitalId: doctorRow.hospital_id, doctorId: doctorRow.id, displayName: doctorRow.full_name })
  }

  // clinic_admins used to have a second identity column (auth_user_id) with
  // its own fallback query here -- confirmed zero production rows use it
  // (Task 10), column dropped in
  // supabase/migrations/20260726000006_drop_clinic_admins_auth_user_id.sql.
  // Every real clinic_admin now has a users row and resolves via the
  // user_id-keyed lookup above (step 2).

  return NextResponse.json(null, { status: 403 })
}
