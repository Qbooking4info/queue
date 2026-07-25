import { getServerUser } from '@/lib/supabase/auth-server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { Errors } from '@/lib/api-error'
import { checkRateLimit } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  try {
    const user = await getServerUser(req)
    if (!user) return Errors.unauthenticated()

    // All DB writes use service role — bypasses RLS safely server-side
    const db = createAdminClient()

    // 5 onboarding attempts per user per hour
    const allowed = await checkRateLimit(db, `onboarding:${user.id}`, 5, 3600)
    if (!allowed) return Errors.forbidden('Too many onboarding attempts. Please wait before trying again.')
    const body = await req.json()
    const {
      name, type, description,
      registrationNumber, mdcnNumber,
      address, city, state, phone, email, whatsapp,
      clinicModel, clinics,
      accepts_virtual, emergency_hours,
      specialtyIds, hours, planId,
    } = body

    // Ensure public profile row exists
    let { data: profile } = await db.from('users').select('id').eq('auth_id', user.id).single()
    if (!profile) {
      const { data: np, error: pErr } = await db
        .from('users')
        .insert({ auth_id: user.id, full_name: user.user_metadata?.full_name ?? 'Admin', email: user.email ?? '' })
        .select('id').single()
      if (pErr) return Errors.internal(pErr.message)
      profile = np
    }

    // BH7: block super_admins from onboarding hospitals — they have no operational hospital context
    const { data: paRow } = await (db as any)
      .from('platform_admins')
      .select('id')
      .eq('user_id', profile!.id)
      .eq('is_active', true)
      .maybeSingle()
    if (paRow) {
      return Errors.forbidden('Super admins are not permitted to onboard hospitals via this flow.')
    }

    // Prevent spam: each user can only own one hospital
    const { data: existingAdmin } = await db
      .from('hospital_admins')
      .select('id')
      .eq('user_id', profile!.id)
      .limit(1)
      .maybeSingle()
    if (existingAdmin) {
      return Errors.forbidden('Your account is already associated with a hospital. Contact support to register an additional hospital.')
    }

    // BM8: planId is required — every hospital must have a subscription from day one.
    // If not provided, auto-assign the free/starter plan; if none exists return 400.
    let resolvedPlanId: string | null = planId ?? null
    if (!resolvedPlanId) {
      const { data: defaultPlan } = await (db as any)
        .from('subscription_plans')
        .select('id')
        .or('name.ilike.%free%,slug.ilike.%free%,name.ilike.%starter%,slug.ilike.%starter%')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle()
      resolvedPlanId = defaultPlan?.id ?? null
    }
    if (!resolvedPlanId) {
      return NextResponse.json({ error: 'planId is required' }, { status: 400 })
    }

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now().toString(36)

    const { data: hospital, error: hErr } = await db.from('hospitals').insert({
      name, slug, type: type ?? 'hospital',
      description: description || null,
      address, city, state,
      phone: phone || null, email: email || null, whatsapp: whatsapp || null,
      accepts_virtual: accepts_virtual ?? false,
      emergency_hours: emergency_hours ?? false,
      registration_number: registrationNumber || null,
      mdcn_accreditation: mdcnNumber || null,
      clinic_model: clinicModel ?? 'single',
      is_verified: false,
    }).select('id').single()
    if (hErr) return Errors.internal(hErr.message)

    // Link admin as owner
    await db.from('hospital_admins').insert({
      hospital_id: hospital.id,
      user_id: profile.id,
      role: 'owner',
    })

    // Save specialties
    if (specialtyIds?.length > 0) {
      await db.from('hospital_specialties').insert(
        specialtyIds.map((sid: string) => ({ hospital_id: hospital.id, specialty_id: sid }))
      )
    }

    // Save operating hours
    const openHours = (hours ?? []).filter((h: { closed: boolean }) => !h.closed)
    if (openHours.length > 0) {
      await db.from('hospital_operating_hours').insert(
        openHours.map((h: { day: number; open: string; close: string }) => ({
          hospital_id: hospital.id, day_of_week: h.day, open_time: h.open, close_time: h.close,
        }))
      )
    }

    // BM8: always create a subscription row — every hospital must have one
    await db.from('hospital_subscriptions').insert({
      hospital_id: hospital.id, plan_id: resolvedPlanId, status: 'trialing',
      trial_ends_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    })

    // Save clinics (multi-clinic model) — requires hospital_clinics table
    if (clinicModel === 'multi' && Array.isArray(clinics) && clinics.length > 0) {
      const validClinics = (clinics as { id: string; name: string; description: string }[])
        .filter(c => c.name?.trim())
      if (validClinics.length > 0) {
        // Use raw SQL via RPC in case the table was just created
        const { error: clinicErr } = await db.from('hospital_clinics').insert(
          validClinics.map((c, i) => ({
            hospital_id: hospital.id,
            name: c.name.trim(),
            description: c.description?.trim() || null,
            sort_order: i,
            is_active: true,
          }))
        )
        // Non-fatal: table may not exist yet — log but don't fail onboarding
        if (clinicErr) {
          console.warn('hospital_clinics insert failed (run migration?):', clinicErr.message)
        }
      }
    }

    return NextResponse.json({ success: true, hospitalId: hospital.id })
  } catch (e: unknown) {
    return Errors.internal(e instanceof Error ? e.message : String(e))
  }
}
