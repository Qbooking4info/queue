import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseJsClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import type { Database } from '@/types/database'
import { supabasePublicKey } from './public-key'

const fetchWithTimeout: typeof fetch = (input, init) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  return fetch(input, { ...init, signal: controller.signal })
    .finally(() => clearTimeout(timer))
}

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    supabasePublicKey(),
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {} // Server component — middleware handles refresh
        },
      },
      global: { fetch: fetchWithTimeout },
    }
  )
}

/**
 * A client that acts as the real caller for RPCs whose SECURITY DEFINER body
 * resolves auth.uid() itself (set_unit_duty, record_patient_location, etc) --
 * calling those with the service role evaluates auth.uid() as null and they
 * reject with "not authenticated". createClient() only reads cookies, so a
 * mobile caller with no cookies at all (Authorization: Bearer <jwt> instead)
 * got exactly that failure on every such call -- this was never exercised
 * over bearer auth before now (the crew app calls set_unit_duty directly
 * from its own already-authenticated client, not through a route; the one
 * route that did use createClient() for this, POST .../units/[id]/duty, had
 * no mobile caller until the Ambulance app's own admin console started using
 * it). Passing the incoming Authorization header straight through makes
 * PostgREST populate auth.uid() from it exactly the way a cookie session
 * would, with RLS/SECURITY DEFINER checks still fully enforced -- this is
 * not a privilege escalation, just a transport-agnostic way to "run this
 * request as whoever sent it".
 */
export async function createUserScopedClient(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    return createSupabaseJsClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      supabasePublicKey(),
      { global: { headers: { Authorization: authHeader }, fetch: fetchWithTimeout } },
    )
  }
  return createClient()
}
