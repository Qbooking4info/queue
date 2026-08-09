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

// Nigeria (WAT) calendar date, not UTC and not the server process's own configured
// timezone. Two failure modes this avoids:
//   1. Date#toISOString() shifts to UTC first, which silently rolls back to the
//      previous day in positive-offset timezones (e.g. WAT, UTC+1).
//   2. Using Date's local getters (getFullYear/getMonth/getDate) assumes the
//      *server process itself* is running in WAT -- true on a machine physically
//      configured for it, false by default on Vercel (defaults to UTC). A request
//      handled between 00:00-01:00 WAT (23:00-00:00 UTC) would then read as
//      "today" on a WAT-configured machine but "yesterday" on a UTC one, purely
//      based on server config, not on what day it actually is in Nigeria. This is
//      exactly what let a patient's check-in be dated a day early. WAT has no DST,
//      so a fixed +1h offset off the UTC-agnostic instant (Date.now(), not any
//      local getter) is correct year-round regardless of server configuration.
export function fmtLocalDate(d: Date): string {
  const wat = new Date(d.getTime() + 60 * 60 * 1000)
  return `${wat.getUTCFullYear()}-${String(wat.getUTCMonth() + 1).padStart(2, '0')}-${String(wat.getUTCDate()).padStart(2, '0')}`
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
