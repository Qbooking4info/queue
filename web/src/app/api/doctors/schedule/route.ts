import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { Errors } from '@/lib/api-error'
import { checkRateLimit } from '@/lib/rate-limit'
import { fmtLocalDate, todayLocalDate } from '@/lib/dashboard-utils'
import { requireRole } from '@/lib/supabase/auth-server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return Errors.unauthenticated()

  const db = createAdminClient()

  const { data: profile } = await db.from('users').select('id').eq('auth_id', user.id).single()
  if (!profile) return Errors.forbidden('Profile not found')

  const { data: adminRecord } = await db
    .from('hospital_admins').select('hospital_id, role')
    .eq('user_id', profile.id).single()
  if (!adminRecord || (adminRecord.role !== 'admin' && adminRecord.role !== 'owner'))
    return Errors.forbidden()

  // Bulk slot generation (up to 180 days x multiple slots/day) -- 20 regenerations
  // per hospital per hour is generous for legitimate schedule editing.
  const rlAllowed = await checkRateLimit(db, `doctors-schedule:${adminRecord.hospital_id}`, 20, 3600)
  if (!rlAllowed) return Errors.forbidden('Too many schedule generation attempts. Please try again later.')

  const body = await req.json()
  const {
    doctor_id,
    working_days,      // number[] e.g. [1,2,3,4,5] = Mon-Fri
    start_time,        // "08:00"
    end_time,          // "17:00"
    slot_duration,     // minutes: 15|20|30|45|60
    days_ahead,        // how many days to generate: 14|30|60|90
    accepts_virtual,   // bool
  } = body
  // clear_existing was removed — use POST /api/doctors/schedule/clear instead

  if (!doctor_id || !working_days?.length || !start_time || !end_time || !slot_duration)
    return Errors.validation('Missing required fields')

  const timeRe = /^\d{2}:\d{2}$/
  if (!timeRe.test(start_time) || !timeRe.test(end_time))
    return Errors.validation('start_time and end_time must be HH:MM')

  const [sh, sm] = start_time.split(':').map(Number)
  const [eh, em] = end_time.split(':').map(Number)
  if (sh * 60 + sm >= eh * 60 + em)
    return Errors.validation('start_time must be before end_time')

  if (!Number.isInteger(days_ahead) || days_ahead < 1 || days_ahead > 180)
    return Errors.validation('days_ahead must be between 1 and 180')

  const VALID_DURATIONS = [10, 15, 20, 30, 45, 60]
  if (!VALID_DURATIONS.includes(slot_duration))
    return Errors.validation(`slot_duration must be one of ${VALID_DURATIONS.join(', ')}`)

  // Verify doctor belongs to this hospital
  const { data: doctor } = await db.from('doctors')
    .select('id, accepts_virtual, clinic_id')
    .eq('id', doctor_id)
    .eq('hospital_id', adminRecord.hospital_id)
    .single()
  if (!doctor) return Errors.notFound('Doctor')

  // Slots may only be generated inside the doctor's clinic's declared operating
  // hours (falling back to the hospital's hours if the clinic has no custom
  // override, and to the app-wide Mon-Sat 08:00-18:00 default if neither is
  // set) — otherwise a clinic marking itself "closed" on a day has no effect
  // on what patients can actually book.
  type DayHours = { open: string; close: string; closed: boolean }
  const defaultHoursForDay = (dow: number): DayHours => ({ open: '08:00', close: '18:00', closed: dow === 0 })

  const [{ data: clinicHourRows }, { data: hospitalHourRows }] = await Promise.all([
    (doctor as any).clinic_id
      ? db.from('hospital_clinic_hours')
          .select('day_of_week, open_time, close_time, is_closed')
          .eq('clinic_id', (doctor as any).clinic_id)
      : Promise.resolve({ data: [] }),
    db.from('hospital_operating_hours')
      .select('day_of_week, open_time, close_time, is_closed')
      .eq('hospital_id', adminRecord.hospital_id),
  ])

  type HourRow = { day_of_week: number; open_time: string; close_time: string; is_closed: boolean }
  const clinicByDay = new Map<number, HourRow>(((clinicHourRows ?? []) as HourRow[]).map(r => [r.day_of_week, r]))
  const hospitalByDay = new Map<number, HourRow>(((hospitalHourRows ?? []) as HourRow[]).map(r => [r.day_of_week, r]))

  function effectiveHours(dow: number): DayHours {
    const row = clinicByDay.get(dow) ?? hospitalByDay.get(dow)
    if (!row) return defaultHoursForDay(dow)
    return { open: row.open_time.slice(0, 5), close: row.close_time.slice(0, 5), closed: row.is_closed }
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Build slots to insert
  const slots: {
    doctor_id: string; hospital_id: string; slot_date: string
    start_time: string; end_time: string; is_virtual: boolean
    is_available: boolean; max_capacity: number; booked_count: number
  }[] = []

  let skippedForHours = 0

  for (let i = 0; i < days_ahead; i++) {
    const date = new Date(today)
    date.setDate(today.getDate() + i)
    const dow = date.getDay()

    if (!working_days.includes(dow)) continue

    const hours = effectiveHours(dow)
    if (hours.closed) { skippedForHours++; continue }

    const [oh, om] = hours.open.split(':').map(Number)
    const [ch, cm] = hours.close.split(':').map(Number)
    const openMins = oh * 60 + om
    const closeMins = ch * 60 + cm

    const dateStr = fmtLocalDate(date)

    // Clamp the requested [start_time, end_time] to the clinic/hospital's
    // actual open window for this day of week.
    let cursor = Math.max(sh * 60 + sm, openMins)
    const endMins = Math.min(eh * 60 + em, closeMins)

    if (cursor >= endMins) { skippedForHours++; continue }

    while (cursor + slot_duration <= endMins) {
      const sH = String(Math.floor(cursor / 60)).padStart(2, '0')
      const sM = String(cursor % 60).padStart(2, '0')
      const eH = String(Math.floor((cursor + slot_duration) / 60)).padStart(2, '0')
      const eM = String((cursor + slot_duration) % 60).padStart(2, '0')

      const base = {
        doctor_id,
        hospital_id: adminRecord.hospital_id,
        slot_date: dateStr,
        start_time: `${sH}:${sM}:00`,
        end_time: `${eH}:${eM}:00`,
        is_available: true,
        max_capacity: 1,
        booked_count: 0,
      }

      slots.push({ ...base, is_virtual: false })
      if (accepts_virtual && doctor.accepts_virtual) {
        slots.push({ ...base, is_virtual: true })
      }

      cursor += slot_duration
    }
  }

  if (!slots.length) {
    return Errors.validation(
      skippedForHours > 0
        ? 'No slots generated — the requested time range falls outside the clinic’s operating hours on every working day'
        : 'No slots generated — check working days and time range'
    )
  }

  // BM5: upsert (not insert) in batches of 500 to prevent duplicate slots when the schedule
  // is regenerated. ON CONFLICT on (doctor_id, slot_date, start_time, is_virtual) is a no-op
  // for existing future slots, preserving booked_count and is_available values.
  let inserted = 0
  for (let i = 0; i < slots.length; i += 500) {
    const batch = slots.slice(i, i + 500)
    const { error } = await (db.from('time_slots') as any).upsert(batch, {
      onConflict: 'doctor_id,slot_date,start_time,is_virtual',
      ignoreDuplicates: true,
    })
    if (error) return Errors.internal(error.message)
    inserted += batch.length
  }

  return NextResponse.json({ success: true, inserted, skippedForHours })
}

// GET — return existing upcoming slots for a doctor. Scoped to staff at the doctor's
// own hospital (super_admin exempt) -- previously any authenticated caller (any role,
// any hospital, even a patient) could pull any doctor's full schedule and booking
// capacity by passing any doctor_id, with no ownership check at all.
export async function GET(req: NextRequest) {
  const auth = await requireRole(['super_admin', 'hospital_admin', 'clinic_admin'], req)
  if (auth instanceof NextResponse) return auth
  const { caller } = auth

  const db = createAdminClient()
  const doctor_id = req.nextUrl.searchParams.get('doctor_id')
  if (!doctor_id) return Errors.validation('doctor_id is required')

  if (caller.role !== 'super_admin') {
    const { data: doctor } = await db.from('doctors').select('hospital_id').eq('id', doctor_id).single()
    if (!doctor || doctor.hospital_id !== caller.hospitalId) return Errors.notFound('Doctor')
  }

  const today = todayLocalDate()

  const { data: slots } = await db.from('time_slots')
    .select('id, slot_date, start_time, end_time, is_virtual, booked_count, max_capacity, is_available')
    .eq('doctor_id', doctor_id)
    .gte('slot_date', today)
    .order('slot_date').order('start_time')
    .limit(1000)

  return NextResponse.json({ slots: slots ?? [] })
}
