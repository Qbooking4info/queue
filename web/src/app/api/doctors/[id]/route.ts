import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/supabase/auth-server'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(['super_admin', 'hospital_admin', 'clinic_admin'])
  if (auth instanceof NextResponse) return auth
  const db = createAdminClient()
  try {
    const { id } = params
    const body = await req.json()
    const allowed = ['full_name','title','specialty_id','consultation_fee','virtual_fee',
                     'years_experience','accepts_virtual','bio','qualification','mdcn_number']
    const updates: Record<string, unknown> = {}
    for (const k of allowed) {
      if (k in body) updates[k] = body[k]
    }

    if ('email' in body) {
      const email = (body.email as string)?.trim()
      if (!email) return NextResponse.json({ error: 'Email cannot be blank' }, { status: 400 })

      const { data: doc } = await (db as any).from('doctors').select('auth_user_id').eq('id', id).single()
      if (doc?.auth_user_id) {
        const { error: authErr } = await db.auth.admin.updateUserById(doc.auth_user_id, { email })
        if (authErr) return NextResponse.json({ error: authErr.message }, { status: 400 })
      }
      updates.email = email
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }
    const { error } = await (db as any).from('doctors').update(updates).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
