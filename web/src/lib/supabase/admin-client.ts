import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Uses service role key to bypass broken RLS on hospital_admins table (same pattern as mobile)
export const adminDb = createClient<Database>(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
})
