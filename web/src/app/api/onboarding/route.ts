import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const db = createAdminClient()
  const body = await req.json()
  const { name, type, description, address, city, state, phone, email, whatsapp,
    accepts_virtual, emergency_hours, specialtyIds, hours, planId } = body

  // Validate required fields server-side
  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'Hospital name is required' }, { status: 400 })
  }
  if (!address || !city || !state) {
    return NextResponse.json({ error: 'Address, city, and state are required' }, { status: 400 })
  }

  // Validate planId references a real plan
  if (planId) {
    const { data: plan } = await db.from('subscription_plans').select('id').eq('id', planId).single()
    if (!plan) {
      return NextResponse.json({ error: 'Invalid plan selected' }, { status: 400 })
    }
  }

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

  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now().toString(36)

  const { data: hospital, error: hErr } = await db.from('hospitals').insert({
    name: name.trim(), slug, type: type ?? 'hospital',
    description: description || null, address, city, state,
    phone: phone || null, email: email || null, whatsapp: whatsapp || null,
    accepts_virtual: accepts_virtual ?? false, emergency_hours: emergency_hours ?? false,
    is_active: true,
  }).select('id').single()
  if (hErr) return NextResponse.json({ error: hErr.message }, { status: 400 })

  const { error: adminErr } = await db
    .from('hospital_admins')
    .insert({ hospital_id: hospital.id, user_id: profile.id, role: 'owner' })
  if (adminErr) {
    // Roll back the hospital row so the user can retry cleanly
    await db.from('hospitals').delete().eq('id', hospital.id)
    return NextResponse.json({ error: 'Failed to link admin account. Please try again.' }, { status: 500 })
  }

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
}
