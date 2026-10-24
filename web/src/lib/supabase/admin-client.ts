import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'


// Short fetch timeout prevents DNS failures from accumulating in memory and causing OOM
const fetchWithTimeout: typeof fetch = (input, init) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  return fetch(input, { ...init, signal: controller.signal })
    .finally(() => clearTimeout(timer))
}

// Service-role client. Server only -- the `server-only` import above makes
// the build fail loudly if a client component ever imports this module,
// instead of silently shipping the key to the browser (Task 1/Task 15: this
// module used to fall back to a browser-reachable client keyed off
// NEXT_PUBLIC_SUPABASE_SERVICE_KEY, which is how a service-role key ends up
// in client JavaScript if that env var is ever set). All 19 dashboard
// components that used to import adminDb (via admin-api.ts) or this module
// directly have been moved to fetch()-based API routes.
//
// Built on first use, not at module load. `next build` evaluates every route
// module to read its config, with no runtime env, so constructing the client
// here threw "supabaseKey is required" and failed the entire deployment --
// every route, because auth-server.ts imports this one.
//
// The proxy keeps the export a value rather than a function, so the 58 call
// sites that write `adminDb.from(...)` are unchanged. Methods are bound to the
// real client so `this` still resolves inside supabase-js.
let client: SupabaseClient<Database> | null = null

function admin(): SupabaseClient<Database> {
  if (!client) {
    client = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: fetchWithTimeout },
      },
    )
  }
  return client
}

export const adminDb = new Proxy({} as SupabaseClient<Database>, {
  get(_target, prop) {
    const c = admin() as unknown as Record<string | symbol, unknown>
    const value = c[prop]
    return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(c) : value
  },
})
