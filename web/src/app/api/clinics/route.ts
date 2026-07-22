import { getServerUser, requireRole } from '@/lib/supabase/auth-server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getClinicsForHospital } from '@/lib/admin-api'
import { NextRequest, NextResponse } from 'next/server'
import { Errors } from '@/lib/api-error'

export async function GET(req: NextRequest) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const hospitalId = new URL(req.url).searchParams.get('hospitalId')
  if (!hospitalId) return NextResponse.json({ error: 'hospitalId required' }, { status: 400 })

  const clinics = await getClinicsForHospital(hospitalId)
  return NextResponse.json(clinics)
}

export async function POST(req: NextRequest) {
  // BC4: clinic creation requires hospital_admin or super_admin — front_desk and
  // clinic_admin must not be able to create clinics for hospitals they don't own.
  const auth = await requireRole(['hospital_admin', 'super_admin'])
  if (auth instanceof NextResponse) return auth
  const { caller } = auth

  const db = createAdminClient()
  const { hospitalId, clinicName, subAdminName, subAdminEmail, tempPassword, serviceTags } = await req.json()

  if (!hospitalId || !clinicName?.trim()) {
    return NextResponse.json({ error: 'hospitalId and clinicName are required' }, { status: 400 })
  }

  // Verify the caller owns this hospital (super_admin is exempt — they manage all hospitals)
  if (caller.role !== 'super_admin' && caller.hospitalId !== hospitalId) {
    return Errors.forbidden()
  }

  // Create the clinic
  const { data: clinic, error: clinicErr } = await db
    .from('hospital_clinics')
    .insert({ hospital_id: hospitalId, name: clinicName.trim(), is_active: true, sort_order: 0, service_tags: serviceTags ?? [] } as any)
    .select('id')
    .single()
  if (clinicErr) return NextResponse.json({ error: clinicErr.message }, { status: 400 })

  // If sub-admin details provided, create their account
  if (subAdminEmail?.trim() && subAdminName?.trim() && tempPassword) {
    const { data: authData, error: authErr } = await db.auth.admin.createUser({
      email: subAdminEmail.trim(),
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: subAdminName.trim(), role: 'clinic_admin' },
    })

    if (authErr) {
      // Roll back clinic if auth user creation failed
      await db.from('hospital_clinics').delete().eq('id', clinic.id)
      return NextResponse.json({ error: authErr.message }, { status: 400 })
    }

    const { data: profile, error: profileErr } = await db
      .from('users')
      .insert({ auth_id: authData.user.id, full_name: subAdminName.trim(), email: subAdminEmail.trim() })
      .select('id')
      .single()

    if (profileErr) return NextResponse.json({ error: profileErr.message }, { status: 400 })

    await db.from('clinic_admins').insert({
      clinic_id: clinic.id,
      hospital_id: hospitalId,
      user_id: profile.id,
      role: 'clinic_admin',
      is_active: true,
    })
  }

  return NextResponse.json({ success: true, clinicId: clinic.id })
}
