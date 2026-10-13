import { supabase } from '@queue/shared/lib/supabase'

// Calls to the web API routes the hospital dashboard also uses (/api/patients,
// /api/virtual, /api/care-plans...). Same routes, same role checks: the web and
// Queue Hospital stay in step by construction.
const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '')

export async function staffApi<T = any>(path: string, init?: { method?: string; body?: unknown }): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return { ok: false, error: 'Not signed in' }
    const res = await fetch(`${API_URL}${path}`, {
      method: init?.method ?? 'GET',
      headers: { Authorization: `Bearer ${session.access_token}`, ...(init?.body ? { 'Content-Type': 'application/json' } : {}) },
      body: init?.body ? JSON.stringify(init.body) : undefined,
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: json?.error ?? `Request failed (${res.status})` }
    return { ok: true, data: json as T }
  } catch {
    return { ok: false, error: 'Check your connection and try again.' }
  }
}

export const fmtDay = (iso: string | null | undefined) =>
  iso ? new Date(iso.length === 10 ? iso + 'T00:00:00' : iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'
