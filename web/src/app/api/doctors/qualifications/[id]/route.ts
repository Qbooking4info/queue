import { createAdminClient } from '@/lib/supabase/admin'
import { getServerUser } from '@/lib/supabase/auth-server'
import { NextRequest, NextResponse } from 'next/server'
import { Errors } from '@/lib/api-error'
import { AUTH_CORS_HEADERS, corsOptions } from '@/lib/cors'

const BUCKET = 'doctor-credentials'

export async function OPTIONS() {
  return corsOptions()
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const res = await handleDELETE(req, { params })
  for (const [k, v] of Object.entries(AUTH_CORS_HEADERS)) res.headers.set(k, v)
  return res
}

async function handleDELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getServerUser(req)
  if (!user) return Errors.unauthenticated()
  const { id } = await params

  const db = createAdminClient()
  const { data: profile } = await db.from('users').select('id').eq('auth_id', user.id).single()
  if (!profile) return Errors.notFound('User profile')

  const { data: doc } = await db
    .from('doctor_qualification_documents')
    .select('id, user_id, file_path')
    .eq('id', id)
    .single()

  if (!doc || doc.user_id !== profile.id) return Errors.notFound('Document')

  await db.storage.from(BUCKET).remove([doc.file_path])
  const { error } = await db.from('doctor_qualification_documents').delete().eq('id', id)
  if (error) return Errors.internal(error.message)

  return NextResponse.json({ success: true })
}
