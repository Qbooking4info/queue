import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl     = process.env.EXPO_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!
const supabasePublicKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLIC_KEY!

// Auth client — persists session, used for everything that needs a user
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})

// Public read-only client — bypasses the broken RLS on hospital_admins
// TODO: replace once proper public-read RLS policies are in place
export const publicDb = createClient(supabaseUrl, supabasePublicKey || supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})
