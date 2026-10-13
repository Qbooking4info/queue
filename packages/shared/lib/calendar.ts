// "Add to Google Calendar" via Google's event template link. Opens the Google Calendar
// app on Android (or the browser) with the visit filled in -- no calendar permission
// or native module needed. Times are Lagos local time.
import { Linking } from 'react-native'

const pad = (n: number) => String(n).padStart(2, '0')
function stamp(date: string, time: string, addMins = 0) {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = (time || '09:00').split(':').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d, hh, mm + addMins))
  return `${dt.getUTCFullYear()}${pad(dt.getUTCMonth() + 1)}${pad(dt.getUTCDate())}T${pad(dt.getUTCHours())}${pad(dt.getUTCMinutes())}00`
}

export function googleCalendarUrl(e: { title: string; date: string; time?: string | null; minutes?: number; details?: string; location?: string }) {
  const start = stamp(e.date, e.time ?? '09:00')
  const end = stamp(e.date, e.time ?? '09:00', e.minutes ?? 30)
  const q = new URLSearchParams({
    action: 'TEMPLATE', text: e.title, dates: `${start}/${end}`, ctz: 'Africa/Lagos',
    ...(e.details ? { details: e.details } : {}), ...(e.location ? { location: e.location } : {}),
  })
  return `https://calendar.google.com/calendar/render?${q.toString()}`
}

export async function addToGoogleCalendar(e: Parameters<typeof googleCalendarUrl>[0]) {
  await Linking.openURL(googleCalendarUrl(e))
}
