import { createClient } from './web/node_modules/@supabase/supabase-js/dist/index.mjs'

const SUPABASE_URL     = 'https://qzodmkgyzguzzyovjpfx.supabase.co'
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF6b2Rta2d5emd1enp5b3ZqcGZ4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDE0MjY2NiwiZXhwIjoyMDk1NzE4NjY2fQ.sWAGt1x-xylUfntHvD4eCaU2h9giAVidRZYMwABZOsY'

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const DEMO_EMAIL    = 'demo@queueapp.ng'
const DEMO_PASSWORD = 'Queue@2025!'

async function run() {
  console.log('👤 Creating demo patient...\n')

  // ── 1. Create auth user ───────────────────────────────────────────────────
  const { data: authData, error: authErr } = await sb.auth.admin.createUser({
    email:             DEMO_EMAIL,
    password:          DEMO_PASSWORD,
    email_confirm:     true,
    user_metadata:     { full_name: 'Adaeze Okonkwo' },
  })

  let authId
  if (authErr) {
    if (authErr.message.includes('already been registered')) {
      console.log('  Auth user already exists — fetching...')
      const { data: list } = await sb.auth.admin.listUsers()
      const existing = list.users.find(u => u.email === DEMO_EMAIL)
      authId = existing?.id
    } else {
      console.error('  Auth error:', authErr.message)
      process.exit(1)
    }
  } else {
    authId = authData.user.id
    console.log('  ✓ Auth user created:', authId)
  }

  // ── 2. Upsert users profile ───────────────────────────────────────────────
  const { data: profileRow, error: profErr } = await sb.from('users').upsert({
    auth_id:        authId,
    email:          DEMO_EMAIL,
    full_name:      'Adaeze Okonkwo',
    phone:          '+234 812 345 6789',
    gender:         'female',
    date_of_birth:  '1997-03-12',
    blood_group:    'O+',
    city:           'Lagos Island',
    state:          'Lagos',
    country:        'Nigeria',
    is_verified:    true,
  }, { onConflict: 'auth_id' }).select('id').single()

  if (profErr) { console.error('  Profile error:', profErr.message); process.exit(1) }
  const userId = profileRow.id
  console.log('  ✓ Patient profile upserted:', userId)

  // ── 3. Fetch hospitals & doctors for demo data ────────────────────────────
  const { data: hospitals } = await sb.from('hospitals').select('id, name, slug').in('slug', [
    'lagos-island-general', 'victoria-crown-hospital',
    'eko-specialist-clinic', 'nisa-premier-hospital',
    'reddington-hospital',
  ])

  const hospMap = Object.fromEntries((hospitals ?? []).map(h => [h.slug, h]))

  const { data: doctors } = await sb.from('doctors').select('id, full_name, hospital_id, consultation_fee')
  const docByHosp = {}
  for (const d of (doctors ?? [])) {
    if (!docByHosp[d.hospital_id]) docByHosp[d.hospital_id] = []
    docByHosp[d.hospital_id].push(d)
  }

  function firstDoc(slug) {
    const h = hospMap[slug]
    if (!h) return null
    return (docByHosp[h.id] ?? [])[0] ?? null
  }
  function docByName(name) {
    return (doctors ?? []).find(d => d.full_name === name)
  }

  // ── 4. Create appointments ────────────────────────────────────────────────
  console.log('\n📅 Creating demo appointments...')

  const today = new Date()
  function dateStr(offsetDays) {
    const d = new Date(today)
    d.setDate(d.getDate() + offsetDays)
    return d.toISOString().split('T')[0]
  }

  const APPOINTMENTS = [
    // Upcoming confirmed
    {
      hospital_slug: 'lagos-island-general',
      doctor_name:   'Dr. Amaka Osei',
      date:          dateStr(3),
      start_time:    '09:00',
      type:          'in-person',
      status:        'confirmed',
      reason:        'Routine cardiac check-up and ECG review.',
      queue_position: 3,
      estimated_wait: 12,
    },
    // Upcoming virtual pending
    {
      hospital_slug: 'victoria-crown-hospital',
      doctor_name:   'Dr. Chioma Okafor',
      date:          dateStr(7),
      start_time:    '11:30',
      type:          'virtual',
      status:        'pending',
      reason:        'Follow-up on last trimester scan results.',
      queue_position: null,
      estimated_wait: null,
    },
    // Completed
    {
      hospital_slug: 'eko-specialist-clinic',
      doctor_name:   'Dr. Bola Adeyemi',
      date:          dateStr(-14),
      start_time:    '10:00',
      type:          'virtual',
      status:        'completed',
      reason:        'Blood pressure review and medication adjustment.',
      queue_position: null,
      estimated_wait: null,
    },
    // Completed in-person
    {
      hospital_slug: 'lagos-island-general',
      doctor_name:   'Dr. Fatima Aliyu',
      date:          dateStr(-30),
      start_time:    '08:30',
      type:          'in-person',
      status:        'completed',
      reason:        'Child wellness check and vaccination update.',
      queue_position: null,
      estimated_wait: null,
    },
    // Cancelled
    {
      hospital_slug: 'nisa-premier-hospital',
      doctor_name:   'Dr. Comfort Eze',
      date:          dateStr(-7),
      start_time:    '14:00',
      type:          'in-person',
      status:        'cancelled',
      reason:        'Cardiology consultation.',
      cancellation_reason: 'Personal emergency — rescheduled',
      queue_position: null,
      estimated_wait: null,
    },
    // Completed
    {
      hospital_slug: 'reddington-hospital',
      doctor_name:   'Dr. Kemi Oladele',
      date:          dateStr(-45),
      start_time:    '13:00',
      type:          'in-person',
      status:        'completed',
      reason:        'Skin rash assessment and patch testing.',
      queue_position: null,
      estimated_wait: null,
    },
  ]

  const apptIds = []
  for (const a of APPOINTMENTS) {
    const hosp = hospMap[a.hospital_slug]
    const doc  = docByName(a.doctor_name)
    if (!hosp || !doc) { console.log(`  ✗ Skipping: ${a.doctor_name} at ${a.hospital_slug} (not found)`); continue }

    const bookingRef = `QUE-${String(Math.floor(10000 + Math.random() * 90000))}`
    const { data: appt, error: apptErr } = await sb.from('appointments').insert({
      patient_id:          userId,
      doctor_id:           doc.id,
      hospital_id:         hosp.id,
      appointment_date:    a.date,
      start_time:          a.start_time,
      type:                a.type,
      status:              a.status,
      reason:              a.reason,
      cancellation_reason: a.cancellation_reason ?? null,
      cancelled_at:        a.status === 'cancelled' ? new Date().toISOString() : null,
      queue_position:      a.queue_position ?? null,
      estimated_wait:      a.estimated_wait ?? null,
      booking_ref:         bookingRef,
    }).select('id, booking_ref').single()

    if (apptErr) {
      console.log(`  ✗ Appointment error: ${apptErr.message}`)
    } else {
      apptIds.push({ id: appt.id, ref: appt.booking_ref, status: a.status, doctor: a.doctor_name })
      console.log(`  ✓ ${bookingRef} — ${a.doctor_name} (${a.status}) on ${a.date}`)
    }
  }

  // ── 5. Create notifications ───────────────────────────────────────────────
  console.log('\n🔔 Creating demo notifications...')

  const confirmedAppt = apptIds.find(a => a.status === 'confirmed')
  const completedAppts = apptIds.filter(a => a.status === 'completed')

  const now = new Date()
  function isoAgo(hours) {
    const d = new Date(now)
    d.setHours(d.getHours() - hours)
    return d.toISOString()
  }

  const NOTIFICATIONS = [
    {
      type:       'reminder',
      title:      'Appointment Tomorrow',
      body:       `Reminder: Dr. Amaka Osei · Cardiology · Lagos Island General\n${dateStr(3)} at 9:00 AM`,
      is_read:    false,
      created_at: isoAgo(2),
      data:       confirmedAppt ? { appointment_id: confirmedAppt.id } : null,
    },
    {
      type:       'confirmed',
      title:      'Booking Confirmed',
      body:       confirmedAppt
        ? `${confirmedAppt.ref} is confirmed. Dr. Amaka Osei — ${dateStr(3)}, 9:00 AM\nPayment of ₦15,500 received.`
        : 'Your booking is confirmed.',
      is_read:    false,
      created_at: isoAgo(5),
      data:       confirmedAppt ? { appointment_id: confirmedAppt.id } : null,
    },
    {
      type:       'waitlist',
      title:      'Slot Just Opened',
      body:       'A cancellation opened at Victoria Crown Hospital — this week, 10:30 AM. Limited slots.',
      is_read:    false,
      created_at: isoAgo(6),
      data:       null,
    },
    {
      type:       'virtual',
      title:      'Virtual Room Ready',
      body:       'Your video consultation with Dr. Chioma Okafor is ready to start. Join before your slot expires.',
      is_read:    true,
      created_at: isoAgo(30),
      data:       null,
    },
    {
      type:       'prescription',
      title:      'New Prescription',
      body:       'Dr. Fatima Aliyu has issued a prescription after your Pediatrics visit. Download PDF.',
      is_read:    true,
      created_at: isoAgo(36),
      data:       completedAppts[1] ? { appointment_id: completedAppts[1].id } : null,
    },
    {
      type:       'lab',
      title:      'Lab Results Available',
      body:       'Your Full Blood Count (FBC) results from Lagos Island General are now ready to view.',
      is_read:    true,
      created_at: isoAgo(42),
      data:       null,
    },
    {
      type:       'payment',
      title:      'Payment Successful',
      body:       `₦20,500 paid for virtual consultation with Dr. Bola Adeyemi · ${completedAppts[0]?.ref ?? 'QUE-00371'}.`,
      is_read:    true,
      created_at: isoAgo(72 * 3),
      data:       completedAppts[0] ? { appointment_id: completedAppts[0].id } : null,
    },
    {
      type:       'review',
      title:      'Rate Your Visit',
      body:       'How was your appointment with Dr. Fatima Aliyu? Your review helps other patients.',
      is_read:    true,
      created_at: isoAgo(72 * 5),
      data:       completedAppts[1] ? { appointment_id: completedAppts[1].id } : null,
    },
    {
      type:       'cancelled',
      title:      'Appointment Cancelled',
      body:       `Your appointment with Dr. Comfort Eze was cancelled. A full refund is on its way.`,
      is_read:    true,
      created_at: isoAgo(24 * 7),
      data:       null,
    },
    {
      type:       'system',
      title:      'Welcome to Queue',
      body:       'Your account is verified. You can now book appointments at any hospital on the platform.',
      is_read:    true,
      created_at: isoAgo(24 * 30),
      data:       null,
    },
  ]

  for (const n of NOTIFICATIONS) {
    const { error: nErr } = await sb.from('notifications').insert({
      user_id:    userId,
      type:       n.type,
      title:      n.title,
      body:       n.body,
      is_read:    n.is_read,
      created_at: n.created_at,
      data:       n.data,
      sent_via:   ['in_app'],
    })
    if (nErr) {
      console.log(`  ✗ Notification error: ${nErr.message}`)
    } else {
      console.log(`  ✓ [${n.type}] ${n.title}`)
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n✅ Demo user ready!\n')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('  📧 Email:    ' + DEMO_EMAIL)
  console.log('  🔑 Password: ' + DEMO_PASSWORD)
  console.log('  👤 Name:     Adaeze Okonkwo')
  console.log('  🆔 User ID:  ' + userId)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`  📅 ${apptIds.length} appointments (2 upcoming, 3 completed, 1 cancelled)`)
  console.log(`  🔔 ${NOTIFICATIONS.length} notifications (3 unread)`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
}

run().catch(console.error)
