import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/supabase/auth-server'
import { Errors } from '@/lib/api-error'
import { checkRateLimit } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  const auth = await requireRole(['super_admin', 'hospital_admin', 'clinic_admin'])
  if (auth instanceof NextResponse) return auth
  const db = createAdminClient()
  try {
    const body = await req.json()
    const { clinicId, hospitalId, staffName, staffEmail, tempPassword, role: rawRole = 'front_desk' } = body
    const role = rawRole === 'desk_officer' ? 'front_desk' : rawRole

    if (!clinicId || !hospitalId || !staffName || !staffEmail || !tempPassword) {
      return Errors.validation('Missing required fields')
    }

    // 20 staff creations per hospital per hour
    const allowed = await checkRateLimit(db, `clinic-staff:${hospitalId}`, 20, 3600)
    if (!allowed) return Errors.forbidden('Too many staff creation attempts. Please try again later.')

    const { data: authData, error: authErr } = await db.auth.admin.createUser({
      email: staffEmail,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: staffName },
    })
    if (authErr) return Errors.internal(authErr.message)

    const { data: userRow, error: userErr } = await db
      .from('users')
      .insert({ auth_id: authData.user.id, full_name: staffName, email: staffEmail })
      .select('id')
      .single()

    if (userErr) {
      await db.auth.admin.deleteUser(authData.user.id)
      return Errors.internal(userErr.message)
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
      return Errors.internal(caErr.message)
    }

    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    return Errors.internal(e instanceof Error ? e.message : String(e))
  }
}

// Update staff profile (name and/or email)
export async function PATCH(req: NextRequest) {
  const auth = await requireRole(['super_admin', 'hospital_admin', 'clinic_admin'])
  if (auth instanceof NextResponse) return auth
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
    if (caErr || !caRow) return Errors.notFound('Staff')

    // Get auth_id from users table
    const { data: userRow } = await db
      .from('users')
      .select('id, auth_id')
      .eq('id', caRow.user_id)
      .single()
    if (!userRow) return Errors.notFound('User record')

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
    return Errors.internal(e instanceof Error ? e.message : String(e))
  }
}

// Deactivate a staff member and immediately revoke their sessions
export async function DELETE(req: NextRequest) {
  const auth = await requireRole(['super_admin', 'hospital_admin', 'clinic_admin'])
  if (auth instanceof NextResponse) return auth
  const db = createAdminClient()
  try {
    const { staffId } = await req.json()
    if (!staffId) return Errors.validation('staffId is required')

    // Resolve auth UID before deactivating so we can revoke sessions
    let staffAuthId: string | null = null
    const { data: caRow } = await db.from('clinic_admins').select('user_id').eq('id', staffId).single()
    if (caRow?.user_id) {
      const { data: userRow } = await db.from('users').select('auth_id').eq('id', caRow.user_id).single()
      staffAuthId = userRow?.auth_id ?? null
    }

    const { error } = await db.from('clinic_admins').update({ is_active: false }).eq('id', staffId)
    if (error) return Errors.internal(error.message)

    // Revoke active sessions so the deactivation takes effect immediately
    // (requireRole already blocks future calls via is_active check, but this
    //  closes any in-flight authenticated connections)
    if (staffAuthId) {
      try {
        await (db.auth.admin as any).signOut(staffAuthId)
      } catch {
        // Non-fatal: is_active = false blocks all subsequent API calls
      }
    }

    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    return Errors.internal(e instanceof Error ? e.message : String(e))
  }
}
