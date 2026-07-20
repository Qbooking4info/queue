import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/supabase/auth-server'
import { Errors } from '@/lib/api-error'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(['hospital_admin', 'clinic_admin'])
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  const db = createAdminClient()
  try {
    const { id } = params
    const body = await req.json()

    // BC2: verify the doctor belongs to the caller's hospital before any write
    if (caller.hospitalId) {
      const { data: ownerCheck } = await (db as any)
        .from('doctors')
        .select('id')
        .eq('id', id)
        .eq('hospital_id', caller.hospitalId)
        .single()
      if (!ownerCheck) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const allowed = ['full_name','title','specialty_id','consultation_fee','virtual_fee',
                     'years_experience','accepts_virtual','bio','qualification','mdcn_number']
    const updates: Record<string, unknown> = {}
    for (const k of allowed) {
      if (k in body) updates[k] = body[k]
    }

    if ('email' in body) {
      const email = (body.email as string)?.trim()
      if (!email) return Errors.validation('Email cannot be blank')

      const { data: doc } = await (db as any).from('doctors').select('auth_user_id').eq('id', id).single()
      if (doc?.auth_user_id) {
        const { error: authErr } = await db.auth.admin.updateUserById(doc.auth_user_id, { email })
        if (authErr) return Errors.internal(authErr.message)
      }
      updates.email = email
    }

    if (Object.keys(updates).length === 0) {
      return Errors.validation('No fields to update')
    }
    const { error } = await (db as any).from('doctors').update(updates).eq('id', id)
    if (error) return Errors.internal(error.message)
    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    return Errors.internal(e instanceof Error ? e.message : String(e))
  }
}
