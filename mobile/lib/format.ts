// Shared date/time formatters used across patient and specialist screens.

/** Format an ISO date string (YYYY-MM-DD) as "Mon 20 Jul" */
export function fmtDate(d: string): string {
  if (!d) return '—'
  const dt = new Date(d + 'T00:00:00')
  return dt.toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short' })
}

/** Format a 24-hour time string (HH:MM) as "9:00 AM" */
export function fmt12(time: string): string {
  if (!time) return '—'
  const [hStr, mStr] = time.split(':')
  const h = parseInt(hStr)
  const ampm = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${mStr} ${ampm}`
}
