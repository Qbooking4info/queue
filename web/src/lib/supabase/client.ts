import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database'
import { supabasePublicKey } from './public-key'

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    supabasePublicKey(),
  )
}
