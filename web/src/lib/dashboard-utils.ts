// Pure formatting/display helpers shared between server-only dashboard API
// routes and 'use client' dashboard components. Extracted from admin-api.ts
// (Task 15) -- that module is being locked down to server-only, so anything
// a client component still needs (even a pure function with no DB access)
// has to live somewhere without that guard.

// Some accounts have an incomplete profile where full_name was backfilled with the user's
// email at signup — showing that verbatim as a "name" in the admin UI reads as spam/fake data.
const EMAIL_RE = /\S+@\S+\.\S+/
export function safePatientName(name: string | null | undefined, fallback: string): string {
  if (!name || EMAIL_RE.test(name)) return fallback
  return name
}

export function calcAge(dob: string | null): number | null {
  if (!dob) return null
  return Math.floor((Date.now() - new Date(dob).getTime()) / 31_557_600_000)
}

// Local calendar date, not UTC — Date#toISOString() shifts to UTC first, which
// silently rolls back to the previous day in positive-offset timezones (e.g. WAT, UTC+1).
export function fmtLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function todayLocalDate(): string {
  return fmtLocalDate(new Date())
}

const AVATAR_COLORS = [
  '#1A4A32', '#1A2A4A', '#3A1A4A', '#4A2A1A',
  '#2A1A4A', '#1A3A4A', '#4A1A2A', '#1A4A4A',
]

export function nameToColor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h) + name.charCodeAt(i)
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

export function nameToInitials(name: string) {
  return name.split(' ').filter(Boolean).slice(-2).map(w => w[0].toUpperCase()).join('')
}
