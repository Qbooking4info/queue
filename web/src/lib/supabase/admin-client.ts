import 'server-only'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const url        = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

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
export const adminDb = createClient<Database>(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: fetchWithTimeout },
})
