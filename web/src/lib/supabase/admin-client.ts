import { createClient } from '@supabase/supabase-js'
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database'

const url        = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY
const anonKey    = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Short fetch timeout prevents DNS failures from accumulating in memory and causing OOM
const fetchWithTimeout: typeof fetch = (input, init) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  return fetch(input, { ...init, signal: controller.signal })
    .finally(() => clearTimeout(timer))
}

// Service-role client (server/API routes): bypasses RLS entirely.
// Browser fallback: use createBrowserClient so the session is read from cookies,
// matching the auth client in @/lib/supabase/client. Using createClient here would
// read from localStorage and miss the cookie-stored session, making every RLS
// policy see an anonymous request and return no rows.
export const adminDb = serviceKey
  ? createClient<Database>(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: fetchWithTimeout },
    })
  : (typeof window !== 'undefined'
      ? createBrowserClient<Database>(url, anonKey, {
          global: { fetch: fetchWithTimeout },
        })
      : createClient<Database>(url, anonKey, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: { fetch: fetchWithTimeout },
        })
    )
