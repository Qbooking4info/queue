import { cookies } from 'next/headers'
import { adminDb } from './admin-client'
import { createClient } from './server'
import { createAdminClient } from './admin'
import { NextResponse } from 'next/server'

export type CallerRole = 'super_admin' | 'hospital_admin' | 'clinic_admin' | 'front_desk' | 'doctor'

export interface CallerInfo {
  authId: string
  role: CallerRole
  hospitalId?: string
  clinicId?: string
}

// Resolve the authenticated caller's role using the service-role key (bypasses RLS).
// Returns the CallerInfo if the caller's role is in `allowed`, otherwise a 401/403 NextResponse.
export async function requireRole(allowed: CallerRole[]): Promise<{ caller: CallerInfo } | NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const authId = user.id
  const db = createAdminClient()

  const { data: profile } = await db
    .from('users')
    .select('id')
    .eq('auth_id', authId)
    .single() as { data: { id: string } | null; error: unknown }

  let caller: CallerInfo | null = null

  if (profile) {
    const { data: paRow } = await (db as any)
      .from('platform_admins')
      .select('id')
      .eq('user_id', profile.id)
      .eq('is_active', true)
      .maybeSingle()
    if (paRow) {
      caller = { authId, role: 'super_admin' }
    } else {
      // BC1: filter to admin/owner roles only — specialists must not get hospital_admin privileges
      // BL2: filter to is_active=true — deactivated admins must not authenticate
      const { data: adminRow } = await db
        .from('hospital_admins')
        .select('hospital_id')
        .eq('user_id', profile.id)
        .in('role', ['admin', 'owner'])
        .eq('is_active', true)
        .limit(1)
        .single()
      if (adminRow) {
        caller = { authId, role: 'hospital_admin', hospitalId: adminRow.hospital_id }
      } else {
        const { data: clinicRow } = await (db as any)
          .from('clinic_admins')
          .select('hospital_id, clinic_id, role')
          .eq('user_id', profile.id)
          .eq('is_active', true)
          .limit(1)
          .single()
        if (clinicRow) {
          const r = (clinicRow.role ?? 'clinic_admin') as string
          const isFrontDesk = r === 'front_desk' || r === 'desk_officer'
          caller = {
            authId,
            role: isFrontDesk ? 'front_desk' : 'clinic_admin',
            hospitalId: clinicRow.hospital_id,
            clinicId: clinicRow.clinic_id ?? undefined,
          }
        }
      }
    }
  }

  if (!caller) {
    const { data: doctorRow } = await (db as any)
      .from('doctors')
      .select('id, hospital_id')
      .eq('auth_user_id', authId)
      .single()
    if (doctorRow) {
      caller = { authId, role: 'doctor', hospitalId: doctorRow.hospital_id }
    }
  }

  if (!caller) {
    const { data: caRow } = await (db as any)
      .from('clinic_admins')
      .select('hospital_id, clinic_id, role')
      .eq('auth_user_id', authId)
      .eq('is_active', true)
      .limit(1)
      .single()
    if (caRow) {
      const r = (caRow.role ?? 'clinic_admin') as string
      const isFrontDesk = r === 'front_desk' || r === 'desk_officer'
      caller = {
        authId,
        role: isFrontDesk ? 'front_desk' : 'clinic_admin',
        hospitalId: caRow.hospital_id,
        clinicId: caRow.clinic_id ?? undefined,
      }
    }
  }

  if (!caller || !allowed.includes(caller.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return { caller }
}

function decodeAndParseSession(raw: string): string | null {
  try {
    const decoded = raw.startsWith('base64-')
      ? Buffer.from(raw.slice(7).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
      : raw
    const session = JSON.parse(decoded)
    return session?.access_token ?? null
  } catch {
    return null
  }
}

// Extract JWT from the auth cookie without creating a GoTrueClient.
// Falls back to chunked cookies when the un-chunked cookie is corrupt.
// Mobile clients have no cookies and send `Authorization: Bearer <jwt>` instead —
// check that first when a request is passed in.
export async function getServerUser(req?: Request) {
  const authHeader = req?.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const { data: { user }, error } = await adminDb.auth.getUser(authHeader.slice(7))
    if (error || !user) return null
    return user
  }

  const cookieStore = await cookies()
  const allCookies = cookieStore.getAll()

  const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/\/\/([^.]+)/)?.[1] ?? ''
  const cookieKey = `sb-${projectRef}-auth-token`

  let jwt: string | null = null

  // Try un-chunked direct cookie first
  const direct = allCookies.find(c => c.name === cookieKey)?.value
  if (direct) {
    jwt = decodeAndParseSession(direct)
  }

  // BL3: If direct was absent or corrupt, try chunked cookies.
  // Collect all chunk-like cookies and sort them numerically by the trailing index so that
  // sb-access-token.0, .1, .2 … are always joined in the correct order regardless of the
  // order in which Set-Cookie headers were received.
  if (!jwt) {
    const chunkPattern = new RegExp(`^${cookieKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.(\\d+)$`)
    const chunks = allCookies
      .filter(c => chunkPattern.test(c.name))
      .sort((a, b) => {
        const ai = parseInt(a.name.match(chunkPattern)![1], 10)
        const bi = parseInt(b.name.match(chunkPattern)![1], 10)
        return ai - bi
      })
    if (chunks.length) {
      jwt = decodeAndParseSession(chunks.map(c => c.value).join(''))
    }
  }

  if (!jwt) return null

  const { data: { user }, error } = await adminDb.auth.getUser(jwt)
  if (error || !user) return null
  return user
}
