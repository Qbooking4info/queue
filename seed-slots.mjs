import { createClient } from './web/node_modules/@supabase/supabase-js/dist/index.mjs'

const sb = createClient(
  'https://qzodmkgyzguzzyovjpfx.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF6b2Rta2d5emd1enp5b3ZqcGZ4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDE0MjY2NiwiZXhwIjoyMDk1NzE4NjY2fQ.sWAGt1x-xylUfntHvD4eCaU2h9giAVidRZYMwABZOsY',
  { auth: { persistSession: false } }
)

// Slot times for in-person and virtual
const IN_PERSON_TIMES = [
  ['08:00','08:30'], ['08:30','09:00'], ['09:00','09:30'], ['09:30','10:00'],
  ['10:00','10:30'], ['10:30','11:00'], ['11:00','11:30'],
  ['14:00','14:30'], ['14:30','15:00'], ['15:00','15:30'], ['15:30','16:00'], ['16:00','16:30'],
]
const VIRTUAL_TIMES = [
  ['09:00','09:30'], ['10:00','10:30'], ['11:00','11:30'],
  ['13:00','13:30'], ['14:00','14:30'], ['16:00','16:30'], ['17:00','17:30'],
]

function dateStr(offsetDays) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().split('T')[0]
}

// Generate dates: today + next 13 days (skip Sundays)
function getDates() {
  const dates = []
  for (let i = 0; i <= 13; i++) {
    const d = new Date()
    d.setDate(d.getDate() + i)
    if (d.getDay() !== 0) dates.push(d.toISOString().split('T')[0]) // skip Sunday
  }
  return dates
}

async function run() {
  console.log('🕐 Seeding time slots...\n')

  // Fetch all doctors with their hospital_id and virtual flag
  const { data: doctors, error } = await sb
    .from('doctors')
    .select('id, full_name, hospital_id, accepts_virtual, is_active')
    .eq('is_active', true)

  if (error || !doctors?.length) {
    console.error('Could not fetch doctors:', error?.message)
    process.exit(1)
  }
  console.log(`  Found ${doctors.length} doctors\n`)

  const dates = getDates()
  console.log(`  Generating slots for ${dates.length} days: ${dates[0]} → ${dates[dates.length-1]}\n`)

  let totalSlots = 0
  const BATCH = 200 // insert in batches to avoid request limits

  for (const doctor of doctors) {
    const slots = []

    for (const date of dates) {
      // In-person slots
      for (const [start, end] of IN_PERSON_TIMES) {
        slots.push({
          doctor_id:    doctor.id,
          hospital_id:  doctor.hospital_id,
          slot_date:    date,
          start_time:   start,
          end_time:     end,
          is_available: true,
          is_virtual:   false,
          max_capacity: 1,
          booked_count: 0,
        })
      }
      // Virtual slots (only for doctors that accept virtual)
      if (doctor.accepts_virtual) {
        for (const [start, end] of VIRTUAL_TIMES) {
          slots.push({
            doctor_id:    doctor.id,
            hospital_id:  doctor.hospital_id,
            slot_date:    date,
            start_time:   start,
            end_time:     end,
            is_available: true,
            is_virtual:   true,
            max_capacity: 1,
            booked_count: 0,
          })
        }
      }
    }

    // Insert in batches
    for (let i = 0; i < slots.length; i += BATCH) {
      const batch = slots.slice(i, i + BATCH)
      const { error: insertErr } = await sb.from('time_slots').insert(batch)
      if (insertErr) {
        console.error(`  ✗ ${doctor.full_name}: ${insertErr.message}`)
        break
      }
    }

    totalSlots += slots.length
    const tag = doctor.accepts_virtual ? '(in-person + virtual)' : '(in-person)'
    console.log(`  ✓ ${doctor.full_name}: ${slots.length} slots ${tag}`)
  }

  console.log(`\n✅ Done! ${totalSlots.toLocaleString()} slots seeded across ${doctors.length} doctors.\n`)
}

run().catch(console.error)
