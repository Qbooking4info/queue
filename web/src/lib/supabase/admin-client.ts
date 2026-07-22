import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY
const anonKey   = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Short fetch timeout prevents DNS failures from accumulating in memory and causing OOM
const fetchWithTimeout: typeof fetch = (input, init) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  return fetch(input, { ...init, signal: controller.signal })
    .finally(() => clearTimeout(timer))
}

// When a service key is available, use a session-less admin client.
// When only the anon key is available (browser without service key), enable session
// persistence so the authenticated user's JWT is sent — RLS role policies still apply.
export const adminDb = serviceKey
  ? createClient<Database>(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: fetchWithTimeout },
    })
  : createClient<Database>(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      global: { fetch: fetchWithTimeout },
    })
