import { createAdminClient } from '@/lib/supabase/admin'
import { getServerUser } from '@/lib/supabase/auth-server'
import { NextResponse, NextRequest } from 'next/server'
import { Errors } from '@/lib/api-error'
import { AUTH_CORS_HEADERS, corsOptions } from '@/lib/cors'

// GET /api/dependents/linked -- powers both halves of the mobile "Dependents"
// screen in one call: who this account manages (managing), and who manages
// this account, if anyone (managedBy). Called cross-origin by the mobile app
// (localhost:8081 -> localhost:3000) -- needs real CORS handling, same as
// appointments/[id]/route.ts and doctors/link/route.ts. Missing this here
// made every fetch() reject with "Failed to fetch" in the browser, and since
// getLinkedDependents()/load() had no try/catch, the Dependents screen's
// setLoading(false) was never reached -- looked like an infinite load, not a
// network error.
export async function OPTIONS() {
  return corsOptions()
}

export async function GET(req: NextRequest) {
  const res = await handleGET(req)
  for (const [k, v] of Object.entries(AUTH_CORS_HEADERS)) res.headers.set(k, v)
  return res
}

async function handleGET(req: NextRequest) {
  const user = await getServerUser(req)
  if (!user) return Errors.unauthenticated()

  const db = createAdminClient()
  const { data: caller } = await db.from('users').select('id').eq('auth_id', user.id).single()
  if (!caller) return Errors.notFound('User')

  const [managingRes, managedByRes] = await Promise.all([
    db.from('dependent_links')
      .select('id, relationship, dependent:users!dependent_links_dependent_id_fkey(id, full_name, date_of_birth, gender)')
      .eq('caretaker_id', caller.id).eq('status', 'active'),
    db.from('dependent_links')
      .select('id, relationship, caretaker:users!dependent_links_caretaker_id_fkey(id, full_name)')
      .eq('dependent_id', caller.id).eq('status', 'active')
      .maybeSingle(),
  ])

  const managing = (managingRes.data ?? []).map((r: any) => ({
    linkId: r.id, relationship: r.relationship, dependent: r.dependent,
  }))
  const managedBy = managedByRes.data
    ? { linkId: (managedByRes.data as any).id, relationship: (managedByRes.data as any).relationship, caretaker: (managedByRes.data as any).caretaker }
    : null

  return NextResponse.json({ managing, managedBy })
}
