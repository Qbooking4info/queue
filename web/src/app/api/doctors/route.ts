import { createAdminClient } from '@/lib/supabase/admin'
import { getServerUser } from '@/lib/supabase/auth-server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const db = createAdminClient()
  const {
    hospitalId, clinicId,
    full_name, title, specialty_id,
    consultation_fee, virtual_fee, years_experience,
    accepts_virtual, bio, qualification, mdcn_number,
    login_email, login_password,
  } = await req.json()

  if (!hospitalId || !full_name?.trim()) {
    return NextResponse.json({ error: 'hospitalId and full_name are required' }, { status: 400 })
  }

  let auth_user_id: string | null = null

  // Optionally create an auth account so the doctor can log in
  if (login_email?.trim() && login_password) {
    const { data: authData, error: authErr } = await db.auth.admin.createUser({
      email: login_email.trim(),
      password: login_password,
      email_confirm: true,
      user_metadata: { full_name: full_name.trim(), role: 'doctor' },
    })
    if (authErr) return NextResponse.json({ error: authErr.message }, { status: 400 })
    auth_user_id = authData.user.id
  }

  const { data, error } = await db
    .from('doctors')
    .insert({
      hospital_id: hospitalId,
      clinic_id: clinicId || null,
      is_active: true,
      full_name: full_name.trim(),
      title: title?.trim() || null,
      specialty_id: specialty_id || null,
      consultation_fee: consultation_fee ?? null,
      virtual_fee: virtual_fee ?? null,
      years_experience: years_experience ?? null,
      accepts_virtual: accepts_virtual ?? false,
      bio: bio?.trim() || null,
      qualification: qualification?.trim() || null,
      mdcn_number: mdcn_number?.trim() || null,
      ...(auth_user_id ? { auth_user_id } : {}),
    } as any)
    .select('id')
    .single()

  if (error) {
    // Roll back auth user if doctor insert failed
    if (auth_user_id) await db.auth.admin.deleteUser(auth_user_id)
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ id: data.id, hasLogin: !!auth_user_id })
}
