import 'react-native-url-polyfill/auto'
import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl      = process.env.EXPO_PUBLIC_SUPABASE_URL!
const supabaseAnonKey  = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!
const supabasePublicKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLIC_KEY!

// Supabase session tokens can exceed the 2 KB keychain limit on iOS.
// This adapter chunks large values across multiple SecureStore keys.
const CHUNK = 1800

const SecureStoreAdapter = {
  async getItem(key: string): Promise<string | null> {
    const meta = await SecureStore.getItemAsync(key)
    if (meta === null) return null
    if (!meta.startsWith('__chunks__')) return meta
    const count = parseInt(meta.slice(10), 10)
    const parts: string[] = []
    for (let i = 0; i < count; i++) {
      const part = await SecureStore.getItemAsync(`${key}.${i}`)
      if (part === null) return null
      parts.push(part)
    }
    return parts.join('')
  },
  async setItem(key: string, value: string): Promise<void> {
    if (value.length <= CHUNK) {
      await SecureStore.setItemAsync(key, value)
      return
    }
    const chunks: string[] = []
    for (let i = 0; i < value.length; i += CHUNK) chunks.push(value.slice(i, i + CHUNK))
    await SecureStore.setItemAsync(key, `__chunks__${chunks.length}`)
    await Promise.all(chunks.map((c, i) => SecureStore.setItemAsync(`${key}.${i}`, c)))
  },
  async removeItem(key: string): Promise<void> {
    const meta = await SecureStore.getItemAsync(key)
    if (meta?.startsWith('__chunks__')) {
      const count = parseInt(meta.slice(10), 10)
      await Promise.all(Array.from({ length: count }, (_, i) => SecureStore.deleteItemAsync(`${key}.${i}`)))
    }
    await SecureStore.deleteItemAsync(key)
  },
}

// expo-secure-store has no keychain on web — its native module is an empty {} there,
// so every SecureStore call throws. Left unhandled that stranded the app on "loading"
// forever (nothing ever caught the rejection to flip loading to false). Fall back to
// localStorage on web, matching Supabase's own default browser storage.
const WebStorageAdapter = {
  async getItem(key: string): Promise<string | null> {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null
  },
  async setItem(key: string, value: string): Promise<void> {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value)
  },
  async removeItem(key: string): Promise<void> {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key)
  },
}

// Auth client — session stored encrypted in the device keychain/keystore on native,
// localStorage on web.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: Platform.OS === 'web' ? WebStorageAdapter : SecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})

// Public read-only client — no session needed
export const publicDb = createClient(supabaseUrl, supabasePublicKey || supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})
