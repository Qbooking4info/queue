// Shared date/time formatters used across patient and specialist screens.

/** Format an ISO date string (YYYY-MM-DD) as "Mon 20 Jul" */
export function fmtDate(d: string): string {
  if (!d) return '—'
  const dt = new Date(d + 'T00:00:00')
  return dt.toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short' })
}

/**
 * Today's calendar date as YYYY-MM-DD in the device's own timezone.
 *
 * Not `toISOString().split('T')[0]` — that converts to UTC first, so in WAT
 * (UTC+1) every call between 00:00 and 01:00 local returns *yesterday*. For
 * "today's queue" and walk-in booking dates that means the first hour of each
 * working day reads off the wrong date. Mirrors web's dashboard-utils
 * `fmtLocalDate`/`todayLocalDate`.
 */
export function fmtLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function todayLocalDate(): string {
  return fmtLocalDate(new Date())
}

/** Format a 24-hour time string (HH:MM) as "9:00 AM" */
export function fmt12(time: string): string {
  if (!time) return '—'
  const [hStr, mStr] = time.split(':')
  const h = parseInt(hStr)
  const ampm = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${mStr} ${ampm}`
}

/**
 * Display label for appointments.type.
 *
 * The stored values are 'in-person' (hyphen), 'virtual' and 'home_visit'. "Physical"
 * rather than "In-person" is the wording used across the apps' filters, so the queue
 * and the analytics filter agree on what to call the same thing.
 *
 * Falls back to the raw value rather than guessing, so an unrecognised type shows up
 * as itself instead of being silently mislabelled — which is exactly what the old
 * `isVirtual ? 'Virtual' : 'In-person'` did to home visits.
 */
export function visitTypeLabel(type: string | null | undefined): string {
  if (type === 'virtual') return 'Virtual'
  if (type === 'home_visit') return 'Home visit'
  if (type === 'in-person' || type === 'in_person') return 'Physical'
  return type ?? '—'
}

/** Ionicon matching a visit type, for the same three cases. */
export function visitTypeIcon(type: string | null | undefined): 'videocam-outline' | 'home-outline' | 'business-outline' {
  if (type === 'virtual') return 'videocam-outline'
  if (type === 'home_visit') return 'home-outline'
  return 'business-outline'
}
