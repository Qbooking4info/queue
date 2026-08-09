// Client-side helpers for hospital/clinic operating hours -- shared by anything that
// needs to constrain a date/time picker to when the receiving side is actually open
// (the referral flow; potentially other staff-facing scheduling UI later). Mirrors
// mobile/lib/api.ts's DayHours shape and getHospitalHours/getClinicHours/isOpenNow
// exactly, since both platforms read the same hospital_operating_hours/
// hospital_clinic_hours tables and should treat them identically.

export interface DayHours { day: number; open: string; close: string; closed: boolean }

export function defaultDayHours(): DayHours[] {
  return Array.from({ length: 7 }, (_, day) => ({ day, open: '08:00', close: '18:00', closed: day === 0 }))
}

export function fillDayHours(
  rows: { day_of_week: number; open_time: string; close_time: string; is_closed: boolean | null }[],
): DayHours[] {
  const byDay = new Map(rows.map(r => [r.day_of_week, r]))
  return defaultDayHours().map(d => {
    const r = byDay.get(d.day)
    if (!r) return d
    return { day: d.day, open: r.open_time.slice(0, 5), close: r.close_time.slice(0, 5), closed: r.is_closed ?? false }
  })
}

export function isOpenOnDate(hours: DayHours[], iso: string): boolean {
  const h = hours.find(x => x.day === new Date(iso + 'T00:00:00').getDay())
  return !!h && !h.closed
}

// Hourly marks between open and close (exclusive of close) -- e.g. 08:00..17:00 for an
// 08:00-18:00 day. Deliberately not finer-grained than the hour: this drives a staff-facing
// "preferred arrival window" picker, not a precise slot-booking system.
export function hourlySlotsForDate(hours: DayHours[], iso: string): string[] {
  const h = hours.find(x => x.day === new Date(iso + 'T00:00:00').getDay())
  if (!h || h.closed) return []
  const [oh] = h.open.split(':').map(Number)
  const [ch] = h.close.split(':').map(Number)
  const out: string[] = []
  for (let hour = oh; hour < ch; hour++) out.push(`${String(hour).padStart(2, '0')}:00`)
  return out
}

export function isOpenNow(hours: DayHours[], is24Hours?: boolean | null): boolean {
  if (is24Hours) return true
  const now = new Date()
  const today = hours.find(h => h.day === now.getDay())
  if (!today || today.closed) return false
  const nowMins = now.getHours() * 60 + now.getMinutes()
  const [oh, om] = today.open.split(':').map(Number)
  const [ch, cm] = today.close.split(':').map(Number)
  return nowMins >= oh * 60 + om && nowMins < ch * 60 + cm
}

// Next `n` calendar dates that aren't marked closed. `hours: null` means "not loaded
// yet" -- falls back to every day but Sunday so the picker isn't empty while real hours
// are still in flight.
export function nextOpenDays(n: number, hours: DayHours[] | null): { iso: string; label: string }[] {
  const closedDays = new Set(hours ? hours.filter(h => h.closed).map(h => h.day) : [0])
  const out: { iso: string; label: string }[] = []
  let offset = 0
  const maxOffset = 180
  while (out.length < n && offset < maxOffset) {
    const d = new Date()
    d.setDate(d.getDate() + offset)
    if (!closedDays.has(d.getDay())) {
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      out.push({ iso, label: offset === 0 ? 'Today' : d.toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short' }) })
    }
    offset++
  }
  return out
}
