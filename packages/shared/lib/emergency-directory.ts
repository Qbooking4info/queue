import AsyncStorage from '@react-native-async-storage/async-storage'
import { publicDb } from './supabase'

/**
 * Emergency fallback numbers.
 *
 * Offline-first on purpose. This is the one screen in the app that has to work
 * when everything else doesn't — no session, no signal, dead backend. So the
 * cache is read first and the network refresh is opportunistic, never blocking.
 *
 * Reads emergency_directory_public, never the base table: the view applies the
 * verification decay window, so a number nobody has confirmed in 90 days stops
 * being offered rather than being served stale.
 */

export interface EmergencyContact {
  id: string
  name: string
  kind: 'national' | 'state' | 'hospital_ae' | 'private_fleet'
  phone: string
  alt_phone: string | null
  country: string
  state: string | null
  city: string | null
  priority: number
  notes: string | null
}

const CACHE_KEY = 'queue.emergency_directory.v1'

export const KIND_LABEL: Record<EmergencyContact['kind'], string> = {
  national: 'National emergency',
  state: 'State ambulance service',
  hospital_ae: 'Hospital A&E',
  private_fleet: 'Private ambulance',
}

async function readCache(): Promise<EmergencyContact[]> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as EmergencyContact[]) : []
  } catch {
    // A corrupt cache must not take the fallback panel down with it.
    return []
  }
}

async function writeCache(rows: EmergencyContact[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(rows))
  } catch {
    /* best-effort; the in-memory list still renders this session */
  }
}

/**
 * Cached rows immediately, then the network result if one arrives.
 *
 * `onUpdate` fires at most twice: once from cache (if non-empty), once from the
 * network (if it differs). Callers render whatever they last received — there
 * is deliberately no loading state, because "we're checking" is not a useful
 * thing to show someone who needs a phone number right now.
 */
export function loadEmergencyContacts(
  onUpdate: (rows: EmergencyContact[]) => void,
  opts?: { state?: string | null },
): () => void {
  let cancelled = false

  readCache().then(cached => {
    if (!cancelled && cached.length) onUpdate(filterForState(cached, opts?.state))
  })

  ;(async () => {
    try {
      const { data, error } = await publicDb
        .from('emergency_directory_public')
        .select('id, name, kind, phone, alt_phone, country, state, city, priority, notes')
      if (error || !data) return
      const rows = data as unknown as EmergencyContact[]
      await writeCache(rows)
      if (!cancelled) onUpdate(filterForState(rows, opts?.state))
    } catch {
      // Offline is the expected case here, not an error worth surfacing —
      // the cached list is already on screen.
    }
  })()

  return () => { cancelled = true }
}

/**
 * National lines always show. State-scoped entries only show for the caller's
 * state, so someone in Lagos isn't handed a number for Kano — but if we don't
 * know their state yet, show everything rather than nothing.
 */
export function filterForState(rows: EmergencyContact[], state?: string | null): EmergencyContact[] {
  const scoped = state
    ? rows.filter(r => !r.state || r.state.toLowerCase() === state.toLowerCase())
    : rows
  return [...scoped].sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name))
}

/** Digits, +, and nothing else — anything else can break the dialer intent. */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`
}
