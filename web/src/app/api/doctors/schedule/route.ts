import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const db = createAdminClient()

  const { data: profile } = await db.from('users').select('id').eq('auth_id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 403 })

  const { data: adminRecord } = await db
    .from('hospital_admins').select('hospital_id, role')
    .eq('user_id', profile.id).single()
  if (!adminRecord || (adminRecord.role !== 'admin' && adminRecord.role !== 'owner'))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const body = await req.json()
  const {
    doctor_id,
    working_days,      // number[] e.g. [1,2,3,4,5] = Mon-Fri
    start_time,        // "08:00"
    end_time,          // "17:00"
    slot_duration,     // minutes: 15|20|30|45|60
    days_ahead,        // how many days to generate: 14|30|60|90
    accepts_virtual,   // bool
    clear_existing,    // bool — wipe unbooked future slots first
  } = body

  if (!doctor_id || !working_days?.length || !start_time || !end_time || !slot_duration)
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })

  const timeRe = /^\d{2}:\d{2}$/
  if (!timeRe.test(start_time) || !timeRe.test(end_time))
    return NextResponse.json({ error: 'start_time and end_time must be HH:MM' }, { status: 400 })

  const [sh, sm] = start_time.split(':').map(Number)
  const [eh, em] = end_time.split(':').map(Number)
  if (sh * 60 + sm >= eh * 60 + em)
    return NextResponse.json({ error: 'start_time must be before end_time' }, { status: 400 })

  if (!Number.isInteger(days_ahead) || days_ahead < 1 || days_ahead > 180)
    return NextResponse.json({ error: 'days_ahead must be between 1 and 180' }, { status: 400 })

  const VALID_DURATIONS = [10, 15, 20, 30, 45, 60]
  if (!VALID_DURATIONS.includes(slot_duration))
    return NextResponse.json({ error: `slot_duration must be one of ${VALID_DURATIONS.join(', ')}` }, { status: 400 })

  // Verify doctor belongs to this hospital
  const { data: doctor } = await db.from('doctors')
    .select('id, accepts_virtual')
    .eq('id', doctor_id)
    .eq('hospital_id', adminRecord.hospital_id)
    .single()
  if (!doctor) return NextResponse.json({ error: 'Doctor not found' }, { status: 404 })

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Clear unbooked future slots if requested
  if (clear_existing) {
    const { error: deleteErr } = await db.from('time_slots')
      .delete()
      .eq('doctor_id', doctor_id)
      .gte('slot_date', today.toISOString().split('T')[0])
      .eq('booked_count', 0)
    if (deleteErr) return NextResponse.json({ error: 'Failed to clear existing slots: ' + deleteErr.message }, { status: 500 })
  }

  // Build slots to insert
  const slots: {
    doctor_id: string; hospital_id: string; slot_date: string
    start_time: string; end_time: string; is_virtual: boolean
    is_available: boolean; max_capacity: number; booked_count: number
  }[] = []

  for (let i = 0; i < days_ahead; i++) {
    const date = new Date(today)
    date.setDate(today.getDate() + i)
    const dow = date.getDay()

    if (!working_days.includes(dow)) continue

    const dateStr = date.toISOString().split('T')[0]

    let cursor = sh * 60 + sm
    const endMins = eh * 60 + em

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

  if (!slots.length)
    return NextResponse.json({ error: 'No slots generated — check working days and time range' }, { status: 400 })

  // Insert in batches of 500 to avoid request size limits
  let inserted = 0
  for (let i = 0; i < slots.length; i += 500) {
    const batch = slots.slice(i, i + 500)
    const { error } = await db.from('time_slots').insert(batch)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    inserted += batch.length
  }

  return NextResponse.json({ success: true, inserted })
}

// GET — return existing upcoming slots for a doctor
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const db = createAdminClient()
  const doctor_id = req.nextUrl.searchParams.get('doctor_id')
  if (!doctor_id) return NextResponse.json({ error: 'doctor_id required' }, { status: 400 })

  const today = new Date().toISOString().split('T')[0]

  const { data: slots } = await db.from('time_slots')
    .select('id, slot_date, start_time, end_time, is_virtual, booked_count, max_capacity, is_available')
    .eq('doctor_id', doctor_id)
    .gte('slot_date', today)
    .order('slot_date').order('start_time')
    .limit(1000)

  return NextResponse.json({ slots: slots ?? [] })
}
