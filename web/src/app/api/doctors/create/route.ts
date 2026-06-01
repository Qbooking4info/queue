import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const db = createAdminClient()

  const { data: profile } = await db.from('users').select('id').eq('auth_id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 403 })

  const { data: adminRecord } = await db
    .from('hospital_admins').select('hospital_id, role')
    .eq('user_id', profile.id).single()
  if (!adminRecord || (adminRecord.role !== 'admin' && adminRecord.role !== 'owner'))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const body = await req.json()
  const { full_name, title, qualification, specialty_id, consultation_fee, virtual_fee, accepts_virtual, bio } = body

  if (!full_name?.trim()) return NextResponse.json({ error: 'Doctor name is required' }, { status: 400 })

  // Auto-generate specialist login credentials
  const nameSlug = full_name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '.')
  const charset = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  const suffix = Array.from(crypto.getRandomValues(new Uint8Array(4)))
    .map((b: number) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('')
  const loginEmail = `dr.${nameSlug}.${suffix}@portal.queueapp.co`
  const loginPassword = Array.from(crypto.getRandomValues(new Uint8Array(12)))
    .map((b: number) => charset[b % charset.length]).join('')

  const { data: doctor, error: doctorErr } = await db.from('doctors').insert({
    hospital_id: adminRecord.hospital_id,
    full_name: full_name.trim(),
    title: title ?? 'Dr.',
    qualification: qualification?.trim() || null,
    specialty_id: specialty_id || null,
    consultation_fee: consultation_fee ? Number(consultation_fee) : null,
    virtual_fee: virtual_fee ? Number(virtual_fee) : null,
    accepts_virtual: accepts_virtual ?? false,
    bio: bio?.trim() || null,
    is_active: true,
  }).select('id').single()

  if (doctorErr) return NextResponse.json({ error: doctorErr.message }, { status: 400 })

  const { data: authUser, error: authErr } = await db.auth.admin.createUser({
    email: loginEmail,
    password: loginPassword,
    email_confirm: true,
  })

  if (authErr || !authUser.user) {
    revalidatePath('/dashboard/doctors')
    return NextResponse.json({ success: true, doctorId: doctor.id, loginCreated: false, loginError: authErr?.message })
  }

  const { data: newProfile, error: profileErr } = await db.from('users').insert({
    auth_id: authUser.user.id,
    email: loginEmail,
    full_name: full_name.trim(),
  }).select('id').single()

  if (profileErr || !newProfile) {
    revalidatePath('/dashboard/doctors')
    return NextResponse.json({ success: true, doctorId: doctor.id, loginCreated: false, loginError: profileErr?.message })
  }

  const { error: adminErr } = await db.from('hospital_admins').insert({
    hospital_id: adminRecord.hospital_id,
    user_id: newProfile.id,
    role: 'specialist',
  })

  if (adminErr) {
    revalidatePath('/dashboard/doctors')
    return NextResponse.json({ success: true, doctorId: doctor.id, loginCreated: false, loginError: adminErr.message })
  }

  const { error: linkErr } = await db.from('doctors').update({ user_id: newProfile.id }).eq('id', doctor.id)
  if (linkErr) {
    // Login account was created but doctor→user link failed; report as partial success
    revalidatePath('/dashboard/doctors')
    return NextResponse.json({ success: true, doctorId: doctor.id, loginCreated: false, loginError: linkErr.message })
  }

  revalidatePath('/dashboard/doctors')
  return NextResponse.json({
    success: true,
    doctorId: doctor.id,
    loginCreated: true,
    loginEmail,
    loginPassword,
  })
}
