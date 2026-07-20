import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole } from '@/lib/supabase/auth-server'
import { NextRequest, NextResponse } from 'next/server'
import { Errors } from '@/lib/api-error'
import { checkRateLimit } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  const auth = await requireRole(['hospital_admin', 'clinic_admin'])
  if (auth instanceof NextResponse) return auth
  const { caller } = auth

  const db = createAdminClient()
  const {
    hospitalId, clinicId,
    full_name, title, specialty_id,
    consultation_fee, virtual_fee, years_experience,
    accepts_virtual, bio, qualification, mdcn_number,
    login_email, login_password,
  } = await req.json()

  if (!hospitalId || !full_name?.trim()) {
    return Errors.validation('hospitalId and full_name are required')
  }

  // Hospital admins can only create doctors for their own hospital
  if (caller.role === 'hospital_admin' && caller.hospitalId !== hospitalId) {
    return Errors.forbidden()
  }
  if (caller.role === 'clinic_admin' && caller.hospitalId !== hospitalId) {
    return Errors.forbidden()
  }

  // BH8: plan doctor-seat limit check (mirrors doctors/create/route.ts)
  const { data: sub } = await db
    .from('hospital_subscriptions')
    .select('subscription_plans(max_doctors)')
    .eq('hospital_id', hospitalId)
    .in('status', ['active', 'trialing'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single() as { data: { subscription_plans: { max_doctors: number | null } | null } | null; error: unknown }

  const maxDoctors: number | null = (sub?.subscription_plans as any)?.max_doctors ?? null
  if (maxDoctors !== null) {
    const { count } = await db.from('doctors')
      .select('*', { count: 'exact', head: true })
      .eq('hospital_id', hospitalId)
      .eq('is_active', true)
    if ((count ?? 0) >= maxDoctors) return Errors.planLimitDoctors(maxDoctors)
  }

  // BH8: rate limit — 10 doctor creations per hospital per hour
  const rlAllowed = await checkRateLimit(db, `doctors-create:${hospitalId}`, 10, 3600)
  if (!rlAllowed) return Errors.forbidden('Too many doctor creation attempts. Please try again later.')

  let auth_user_id: string | null = null

  if (login_email?.trim() && login_password) {
    const { data: authData, error: authErr } = await db.auth.admin.createUser({
      email: login_email.trim(),
      password: login_password,
      email_confirm: true,
      user_metadata: { full_name: full_name.trim(), role: 'doctor' },
    })
    if (authErr) return Errors.internal(authErr.message)
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
      email: login_email?.trim() || null,
      ...(auth_user_id ? { auth_user_id } : {}),
    } as any)
    .select('id')
    .single()

  if (error) {
    if (auth_user_id) await db.auth.admin.deleteUser(auth_user_id)
    return Errors.internal(error.message)
  }

  return NextResponse.json({ id: data.id, hasLogin: !!auth_user_id })
}
