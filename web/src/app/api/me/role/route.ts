import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createAdminClient } from '@/lib/supabase/admin'
import { cookies } from 'next/headers'

export async function GET() {
  // 1. Identify the caller via their session cookie
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } },
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json(null, { status: 401 })

  const authId = user.id
  const db = createAdminClient() // service role — bypasses RLS

  // 2. Look up users row
  const { data: profile } = await db
    .from('users')
    .select('id, full_name, is_super_admin')
    .eq('auth_id', authId)
    .single() as { data: { id: string; full_name: string | null; is_super_admin: boolean } | null; error: unknown }

  if (profile) {
    if ((profile as any).is_super_admin) {
      return NextResponse.json({ role: 'super_admin', displayName: profile.full_name })
    }

    const { data: adminRow } = await db
      .from('hospital_admins')
      .select('hospital_id')
      .eq('user_id', profile.id)
      .limit(1)
      .single()
    if (adminRow) {
      return NextResponse.json({ role: 'hospital_admin', hospitalId: adminRow.hospital_id, displayName: profile.full_name })
    }

    const { data: clinicRow } = await (db as any)
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

  // 3. Doctor (auth_user_id on doctors row)
  const { data: doctorRow } = await (db as any)
    .from('doctors')
    .select('id, hospital_id, full_name')
    .eq('auth_user_id', authId)
    .single()
  if (doctorRow) {
    return NextResponse.json({ role: 'doctor', hospitalId: doctorRow.hospital_id, doctorId: doctorRow.id, displayName: doctorRow.full_name })
  }

  // 4. Clinic staff via auth_user_id fallback
  const { data: caRow } = await (db as any)
    .from('clinic_admins')
    .select('hospital_id, clinic_id, role')
    .eq('auth_user_id', authId)
    .eq('is_active', true)
    .limit(1)
    .single()
  if (caRow) {
    const r = (caRow.role ?? 'clinic_admin') as string
    const isFrontDesk = r === 'front_desk' || r === 'desk_officer'
    return NextResponse.json({
      role: isFrontDesk ? 'front_desk' : 'clinic_admin',
      hospitalId: caRow.hospital_id,
      clinicId: caRow.clinic_id ?? null,
    })
  }

  return NextResponse.json(null, { status: 403 })
}
