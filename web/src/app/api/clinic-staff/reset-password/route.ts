import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/supabase/auth-server'

export async function POST(req: NextRequest) {
  const auth = await requireRole(['super_admin', 'hospital_admin', 'clinic_admin'], req)
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  const db = createAdminClient()
  try {
    const { staffId, newPassword } = await req.json()
    if (!staffId || !newPassword) {
      return NextResponse.json({ error: 'staffId and newPassword required' }, { status: 400 })
    }
    if (newPassword.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }

    // Resolve: clinic_admins.id → users.auth_id
    const { data: caRow } = await db
      .from('clinic_admins')
      .select('user_id, hospital_id')
      .eq('id', staffId)
      .single()
    if (!caRow) return NextResponse.json({ error: 'Staff not found' }, { status: 404 })

    // staffId comes from the request body. Without this comparison any hospital
    // or clinic admin could reset the password of any staff member at any OTHER
    // hospital and sign in as them, inheriting their access to that hospital's
    // patient records. Mirrors the check already present on the sibling handler
    // at clinic-staff/route.ts:117.
    if (caller.role !== 'super_admin' && caller.hospitalId !== caRow.hospital_id) {
      return NextResponse.json({ error: "Cannot reset another hospital's staff password" }, { status: 403 })
    }

    const { data: userRow } = await db
      .from('users')
      .select('auth_id')
      .eq('id', caRow.user_id)
      .single()
    if (!userRow?.auth_id) return NextResponse.json({ error: 'No login account found for this staff member' }, { status: 404 })

    const { error } = await db.auth.admin.updateUserById(userRow.auth_id, { password: newPassword })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
