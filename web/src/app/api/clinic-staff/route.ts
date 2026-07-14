import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const db = createAdminClient()
  try {
    const body = await req.json()
    const { clinicId, hospitalId, staffName, staffEmail, tempPassword, role: rawRole = 'front_desk' } = body
    const role = rawRole === 'desk_officer' ? 'front_desk' : rawRole

    if (!clinicId || !hospitalId || !staffName || !staffEmail || !tempPassword) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const { data: authData, error: authErr } = await db.auth.admin.createUser({
      email: staffEmail,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: staffName },
    })
    if (authErr) return NextResponse.json({ error: authErr.message }, { status: 400 })

    const { data: userRow, error: userErr } = await db
      .from('users')
      .insert({ auth_id: authData.user.id, full_name: staffName, email: staffEmail })
      .select('id')
      .single()

    if (userErr) {
      await db.auth.admin.deleteUser(authData.user.id)
      return NextResponse.json({ error: userErr.message }, { status: 400 })
    }

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

// Update staff profile (name and/or email)
export async function PATCH(req: NextRequest) {
  const db = createAdminClient()
  try {
    const { staffId, full_name, email } = await req.json()
    if (!staffId) return NextResponse.json({ error: 'staffId required' }, { status: 400 })

    // Get the user_id linked to this staff record
    const { data: caRow, error: caErr } = await db
      .from('clinic_admins')
      .select('user_id')
      .eq('id', staffId)
      .single()
    if (caErr || !caRow) return NextResponse.json({ error: 'Staff not found' }, { status: 404 })

    // Get auth_id from users table
    const { data: userRow } = await db
      .from('users')
      .select('id, auth_id')
      .eq('id', caRow.user_id)
      .single()
    if (!userRow) return NextResponse.json({ error: 'User record not found' }, { status: 404 })

    const updates: Record<string, string> = {}
    if (full_name?.trim()) updates.full_name = full_name.trim()
    if (email?.trim()) updates.email = email.trim()

    if (Object.keys(updates).length) {
      await (db as any).from('users').update(updates).eq('id', userRow.id)
      if (email?.trim() && userRow.auth_id) {
        await db.auth.admin.updateUserById(userRow.auth_id, { email: email.trim() })
      }
    }

    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

// Deactivate a staff member
export async function DELETE(req: NextRequest) {
  const db = createAdminClient()
  try {
    const { staffId } = await req.json()
    if (!staffId) return NextResponse.json({ error: 'staffId required' }, { status: 400 })

    const { error } = await db
      .from('clinic_admins')
      .update({ is_active: false })
      .eq('id', staffId)

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
