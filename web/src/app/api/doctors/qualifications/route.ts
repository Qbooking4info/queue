import { createAdminClient } from '@/lib/supabase/admin'
import { getServerUser } from '@/lib/supabase/auth-server'
import { NextRequest, NextResponse } from 'next/server'
import { Errors } from '@/lib/api-error'
import { AUTH_CORS_HEADERS, corsOptions } from '@/lib/cors'
import { randomUUID } from 'crypto'

const BUCKET = 'doctor-credentials'
const MAX_BYTES = 10 * 1024 * 1024 // 10MB
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
const SIGNED_URL_TTL_SECS = 300

export async function OPTIONS() {
  return corsOptions()
}

export async function GET(req: NextRequest) {
  return withCors(await handleGET(req))
}

export async function POST(req: NextRequest) {
  return withCors(await handlePOST(req))
}

function withCors(res: NextResponse): NextResponse {
  for (const [k, v] of Object.entries(AUTH_CORS_HEADERS)) res.headers.set(k, v)
  return res
}

async function handleGET(req: NextRequest) {
  const user = await getServerUser(req)
  if (!user) return Errors.unauthenticated()

  const db = createAdminClient()
  const { data: profile } = await db.from('users').select('id').eq('auth_id', user.id).single()
  if (!profile) return Errors.notFound('User profile')

  const { data: docs } = await db
    .from('doctor_qualification_documents')
    .select('id, title, file_path, uploaded_at')
    .eq('user_id', profile.id)
    .order('uploaded_at', { ascending: false })

  const withUrls = await Promise.all((docs ?? []).map(async d => {
    const { data: signed } = await db.storage.from(BUCKET).createSignedUrl(d.file_path, SIGNED_URL_TTL_SECS)
    return { id: d.id, title: d.title, uploadedAt: d.uploaded_at, url: signed?.signedUrl ?? null }
  }))

  return NextResponse.json({ documents: withUrls })
}

async function handlePOST(req: NextRequest) {
  const user = await getServerUser(req)
  if (!user) return Errors.unauthenticated()

  const db = createAdminClient()
  const { data: profile } = await db.from('users').select('id').eq('auth_id', user.id).single()
  if (!profile) return Errors.notFound('User profile')

  const form = await req.formData()
  const file = form.get('file')
  const title = form.get('title')

  if (!(file instanceof File)) return Errors.validation('file is required')
  if (typeof title !== 'string' || !title.trim()) return Errors.validation('title is required')
  if (!ALLOWED_TYPES.includes(file.type)) return Errors.validation('Only PDF, JPEG, PNG, or WEBP files are allowed')
  if (file.size > MAX_BYTES) return Errors.validation('File must be under 10MB')

  const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : ''
  const path = `${profile.id}/${randomUUID()}${ext}`

  const { error: uploadErr } = await db.storage.from(BUCKET).upload(path, await file.arrayBuffer(), {
    contentType: file.type,
  })
  if (uploadErr) return Errors.internal(uploadErr.message)

  const { data, error } = await db
    .from('doctor_qualification_documents')
    .insert({ user_id: profile.id, title: title.trim(), file_path: path } as any)
    .select('id, title, uploaded_at')
    .single()

  if (error) {
    await db.storage.from(BUCKET).remove([path])
    return Errors.internal(error.message)
  }

  const { data: signed } = await db.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECS)
  return NextResponse.json({ document: { ...data, url: signed?.signedUrl ?? null } })
}
