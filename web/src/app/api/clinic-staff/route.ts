import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const db = createAdminClient()
  try {
    const body = await req.json()
    const { clinicId, hospitalId, staffName, staffEmail, tempPassword, role = 'desk_officer' } = body

    if (!clinicId || !hospitalId || !staffName || !staffEmail || !tempPassword) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Create Supabase auth user (server-side only)
    const { data: authData, error: authErr } = await db.auth.admin.createUser({
      email: staffEmail,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: staffName },
    })
    if (authErr) return NextResponse.json({ error: authErr.message }, { status: 400 })

    // Insert public profile
    const { data: userRow, error: userErr } = await db
      .from('users')
      .insert({ auth_id: authData.user.id, full_name: staffName, email: staffEmail })
      .select('id')
      .single()

    if (userErr) {
      await db.auth.admin.deleteUser(authData.user.id)
      return NextResponse.json({ error: userErr.message }, { status: 400 })
    }

    // Link to clinic
    const { error: caErr } = await db.from('clinic_admins').insert({
      clinic_id: clinicId,
      hospital_id: hospitalId,
      user_id: userRow.id,
      role,
      is_active: true,
    })

    if (caErr) {
      await db.auth.admin.deleteUser(authData.user.id)
      return NextResponse.json({ error: caErr.message }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
