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
  doctorId?: string
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
        // clinic_admins used to have a second identity column (auth_user_id)
        // with its own separate fallback query below this whole block --
        // confirmed zero production rows use it (Task 10), dropped in
        // supabase/migrations/20260726000006_drop_clinic_admins_auth_user_id.sql.
        // One lookup, keyed on user_id, is now the only path.
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
    // Portal-created doctor accounts link via user_id; self-registered ones
    // via auth_user_id (same comment as admin-api.ts's getUserRole). This
    // used to only check auth_user_id -- doctors linked via user_id could
    // never authenticate to a requireRole(['doctor']) route at all. Checked
    // live: 6 of 92 doctor rows use user_id with no auth_user_id set.
    const orConditions = [`auth_user_id.eq.${authId}`]
    if (profile) orConditions.push(`user_id.eq.${profile.id}`)

    const { data: doctorRow } = await (db as any)
      .from('doctors')
      .select('id, hospital_id')
      .or(orConditions.join(','))
      .single()
    if (doctorRow) {
      caller = { authId, role: 'doctor', hospitalId: doctorRow.hospital_id, doctorId: doctorRow.id }
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
  } catch (e) {
    // Swallowed on purpose (a corrupt cookie is expected to fall through to
    // the chunked-cookie path or return null), but logged -- this is
    // exactly the diagnostic you want during an auth incident.
    console.warn('[getServerUser] failed to decode/parse auth cookie:', e instanceof Error ? e.message : e)
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
