import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    // Verify session from cookie
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // All DB writes use service role — bypasses RLS safely server-side
    const db = createAdminClient()
    const body = await req.json()
    const { name, type, description, address, city, state, phone, email, whatsapp,
      accepts_virtual, emergency_hours, specialtyIds, hours, planId } = body

    // Ensure public profile row exists
    let { data: profile } = await db.from('users').select('id').eq('auth_id', user.id).single()
    if (!profile) {
      const { data: np, error: pErr } = await db
        .from('users')
        .insert({ auth_id: user.id, full_name: user.user_metadata?.full_name ?? 'Admin', email: user.email ?? '' })
        .select('id').single()
      if (pErr) return NextResponse.json({ error: pErr.message }, { status: 400 })
      profile = np
    }

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now().toString(36)

    const { data: hospital, error: hErr } = await db.from('hospitals').insert({
      name, slug, type: type ?? 'hospital',
      description: description || null, address, city, state,
      phone: phone || null, email: email || null, whatsapp: whatsapp || null,
      accepts_virtual: accepts_virtual ?? false, emergency_hours: emergency_hours ?? false,
    }).select('id').single()
    if (hErr) return NextResponse.json({ error: hErr.message }, { status: 400 })

    await db.from('hospital_admins').insert({ hospital_id: hospital.id, user_id: profile.id, role: 'owner' })

    if (specialtyIds?.length > 0) {
      await db.from('hospital_specialties').insert(
        specialtyIds.map((sid: string) => ({ hospital_id: hospital.id, specialty_id: sid }))
      )
    }

    const openHours = (hours ?? []).filter((h: { closed: boolean }) => !h.closed)
    if (openHours.length > 0) {
      await db.from('hospital_operating_hours').insert(
        openHours.map((h: { day: number; open: string; close: string }) => ({
          hospital_id: hospital.id, day_of_week: h.day, open_time: h.open, close_time: h.close,
        }))
      )
    }

    if (planId) {
      await db.from('hospital_subscriptions').insert({
        hospital_id: hospital.id, plan_id: planId, status: 'trialing',
        trial_ends_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      })
    }

    return NextResponse.json({ success: true, hospitalId: hospital.id })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
