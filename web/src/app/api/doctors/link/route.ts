import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole } from '@/lib/supabase/auth-server'
import { NextRequest, NextResponse } from 'next/server'
import { Errors } from '@/lib/api-error'
import { checkRateLimit } from '@/lib/rate-limit'

// POST /api/doctors/link -- links an existing, independently-registered doctor
// account (from the doctors/ app) to the caller's hospital, given the doctor's own
// short Doctor ID (users.doctor_code, a 6-character human-typeable code -- see
// 20260821000001_short_doctor_code.sql -- shown to the doctor in the doctors app to
// copy and share; NOT the raw users.id UUID this used to be keyed on). This is now
// the ONLY way a hospital adds a doctor -- the old POST /api/doctors, which created a
// brand new doctor + portal login from scratch, was removed so every doctor is a real
// self-registered account, not a hospital-issued one. This finds an account that
// already exists and adds a hospital-scoped doctors row for it, the same shape every
// other hospital-scoped query already expects (no changes needed anywhere that reads
// doctors.hospital_id). The doctor's own account can go on to be linked to any number
// of other hospitals the same way -- see users.active_hospital_id
// (20260816000001_doctor_independent_accounts.sql) for how a doctor with multiple
// links picks which one is "current".
//
// Trust model: the code is effectively an invite code -- only the doctor sees their
// own and chooses who to share it with, so linking is immediate (no separate accept
// step), matching every other "paste a code, get connected" flow in this app.
//
// GET ?code=XXXXXX -- lookup step before the actual link, so the admin can see whose
// account they're about to link and choose the specialty this doctor practices AT
// THIS HOSPITAL (specialty is a per-hospital doctors row column, see
// 20260817000001_direct_doctor_booking.sql -- the same person can be Pediatrics at one
// hospital and General Practice at another). Everything else -- title, qualification,
// bio, years_experience, mdcn_number, avatar_url -- still auto-transfers from their
// existing profile with no admin input, exactly like POST already did.
export async function GET(req: NextRequest) {
  const auth = await requireRole(['hospital_admin', 'super_admin'], req)
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  if (!caller.hospitalId) return Errors.forbidden()

  const code = new URL(req.url).searchParams.get('code')?.trim().toUpperCase()
  if (!code) return Errors.validation('code is required')

  const db = createAdminClient()
  const { data: account } = await db
    .from('users')
    .select('id, full_name')
    .eq('doctor_code', code)
    .single()
  if (!account) return Errors.notFound('No doctor account found with that ID')

  const { data: existing } = await db
    .from('doctors')
    .select('is_active')
    .eq('user_id', account.id)
    .eq('hospital_id', caller.hospitalId)
    .maybeSingle()

  const { data: existingElsewhere } = await db
    .from('doctors')
    .select('specialty_id, specialty:specialties!doctors_specialty_id_fkey(name)')
    .eq('user_id', account.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  return NextResponse.json({
    fullName: account.full_name,
    alreadyLinked: existing?.is_active ?? false,
    suggestedSpecialtyId: existingElsewhere?.specialty_id ?? null,
    suggestedSpecialtyName: (existingElsewhere as any)?.specialty?.name ?? null,
  })
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(['hospital_admin', 'super_admin'], req)
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  if (!caller.hospitalId) return Errors.forbidden()

  const db = createAdminClient()
  const { doctorCode, clinicId, specialtyId } = await req.json()

  if (!doctorCode?.trim()) {
    return Errors.validation('doctorCode is required')
  }

  const { data: account } = await db
    .from('users')
    .select('id, full_name, email, phone')
    .eq('doctor_code', doctorCode.trim().toUpperCase())
    .single()
  if (!account) return Errors.notFound('No doctor account found with that ID')

  const { data: existing } = await db
    .from('doctors')
    .select('id, is_active')
    .eq('user_id', account.id)
    .eq('hospital_id', caller.hospitalId)
    .maybeSingle()

  if (existing?.is_active) {
    return Errors.validation('This doctor is already linked to your hospital')
  }

  // Reactivating a previously-unlinked row, rather than inserting a duplicate --
  // preserves that row's own appointment history/queue. Specialty is still
  // updatable here -- a doctor coming back to a hospital may be re-linked under
  // a different specialty than when they first left. availability_status resets
  // to off_duty too, same reasoning as the fresh-insert path below -- a stale
  // on_duty from before they were unlinked must not make them assignable again
  // the instant they're relinked.
  if (existing) {
    const { error } = await db.from('doctors')
      .update({
        is_active: true, clinic_id: clinicId || null, availability_status: 'off_duty',
        ...(specialtyId ? { specialty_id: specialtyId } : {}),
      })
      .eq('id', existing.id)
    if (error) return Errors.internal(error.message)
    return NextResponse.json({ id: existing.id, relinked: true })
  }

  // BH8: same plan doctor-seat limit as POST /api/doctors -- linking still consumes a seat.
  const { data: sub } = await db
    .from('hospital_subscriptions')
    .select('subscription_plans(max_doctors)')
    .eq('hospital_id', caller.hospitalId)
    .in('status', ['active', 'trialing'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single() as { data: { subscription_plans: { max_doctors: number | null } | null } | null; error: unknown }

  const maxDoctors: number | null = (sub?.subscription_plans as any)?.max_doctors ?? null
  if (maxDoctors !== null) {
    const { count } = await db.from('doctors')
      .select('*', { count: 'exact', head: true })
      .eq('hospital_id', caller.hospitalId)
      .eq('is_active', true)
    if ((count ?? 0) >= maxDoctors) return Errors.planLimitDoctors(maxDoctors)
  }

  const rlAllowed = await checkRateLimit(db, `doctors-link:${caller.hospitalId}`, 20, 3600)
  if (!rlAllowed) return Errors.forbidden('Too many link attempts. Please try again later.')

  // Prefill qualification fields from this doctor's own account if they're already
  // linked elsewhere -- so they don't have to re-enter bio/qualification/MDCN number
  // for every new hospital. Falls back to blank (doctor or hospital fills it in later)
  // for a genuinely first-time link.
  const { data: existingElsewhere } = await db
    .from('doctors')
    .select('title, level, qualification, bio, years_experience, mdcn_number, specialty_id, avatar_url')
    .eq('user_id', account.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  const { data, error } = await db
    .from('doctors')
    .insert({
      hospital_id: caller.hospitalId,
      clinic_id: clinicId || null,
      user_id: account.id,
      is_active: true,
      // Newly linked at THIS hospital -- off_duty (not the doctors table's
      // on_duty default) until they or hospital staff explicitly turn it on,
      // so patients can't be assigned to them here before they've actually
      // started. Their other hospital links are untouched.
      availability_status: 'off_duty',
      full_name: account.full_name,
      email: account.email,
      title: existingElsewhere?.title ?? null,
      level: (existingElsewhere as any)?.level ?? null,
      qualification: existingElsewhere?.qualification ?? null,
      bio: existingElsewhere?.bio ?? null,
      years_experience: existingElsewhere?.years_experience ?? null,
      mdcn_number: existingElsewhere?.mdcn_number ?? null,
      specialty_id: specialtyId ?? existingElsewhere?.specialty_id ?? null,
      avatar_url: existingElsewhere?.avatar_url ?? null,
    } as any)
    .select('id')
    .single()

  if (error) return Errors.internal(error.message)

  return NextResponse.json({ id: data.id, relinked: false })
}
