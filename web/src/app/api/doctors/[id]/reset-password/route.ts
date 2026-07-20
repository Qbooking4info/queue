import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/supabase/auth-server'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(['super_admin', 'hospital_admin', 'clinic_admin'])
  if (auth instanceof NextResponse) return auth
  const db = createAdminClient()
  try {
    const { newPassword } = await req.json()
    if (!newPassword || newPassword.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }

    const { data: doc } = await (db as any)
      .from('doctors')
      .select('auth_user_id, full_name')
      .eq('id', params.id)
      .single()

    if (!doc?.auth_user_id) {
      return NextResponse.json({ error: 'This doctor has no login account. Add login credentials from the Add Doctor form.' }, { status: 404 })
    }

    const { error } = await db.auth.admin.updateUserById(doc.auth_user_id, { password: newPassword })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
