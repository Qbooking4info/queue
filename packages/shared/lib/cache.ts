import AsyncStorage from '@react-native-async-storage/async-storage'

// Offline-first screen cache: show the last good copy instantly, refresh behind it.
// Keys are namespaced per user so a shared phone never shows someone else's visits.
const PREFIX = 'queue:cache:v1:'

export async function readCache<T>(userId: string | undefined, key: string): Promise<T | null> {
  if (!userId) return null
  try {
    const raw = await AsyncStorage.getItem(PREFIX + userId + ':' + key)
    return raw ? (JSON.parse(raw).v as T) : null
  } catch { return null }
}

export async function writeCache<T>(userId: string | undefined, key: string, value: T): Promise<void> {
  if (!userId) return
  try { await AsyncStorage.setItem(PREFIX + userId + ':' + key, JSON.stringify({ v: value, at: Date.now() })) } catch {}
}

/** Drop every cached screen for this user (call on sign-out). */
export async function clearCache(userId: string | undefined): Promise<void> {
  if (!userId) return
  try {
    const keys = await AsyncStorage.getAllKeys()
    await AsyncStorage.multiRemove(keys.filter(k => k.startsWith(PREFIX + userId + ':')))
  } catch {}
}
