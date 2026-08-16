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
