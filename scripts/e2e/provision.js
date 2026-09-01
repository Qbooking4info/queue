// Provisions one test account per role so the sign-in surface matrix can be exercised
// against production the way the apps actually do it. Idempotent: re-running reuses
// existing accounts. Tear down with teardown.js.
process.loadEnvFile('/Users/apple/queue/web/.env.local')
const { createClient } = require('/Users/apple/queue/web/node_modules/@supabase/supabase-js')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } })

const PASS      = 'QueueE2E!2026'
const HOSPITAL  = 'be074fb6-8664-4ff8-a39f-405c3fa3035a'   // Queue OPD
const SPECIALTY = 'db44077a-b4ec-4ce4-b34c-010b729ffdfc'   // General Practice
const PROVIDER  = '4102c8af-1e57-4dbd-baff-783bd248ac95'   // existing ambulance provider

const ACCOUNTS = [
  { key: 'patient',  email: 'e2e.patient@queuetest.com',  name: 'E2E Patient' },
  { key: 'doctor',   email: 'e2e.doctor@queuetest.com',   name: 'E2E Doctor' },
  { key: 'hospital', email: 'e2e.hospital@queuetest.com', name: 'E2E Staff' },
  { key: 'crew',     email: 'e2e.crew@queuetest.com',     name: 'E2E Crew' },
]

async function findAuthUser(email) {
  const { data } = await sb.auth.admin.listUsers({ perPage: 1000 })
  return data.users.find(u => (u.email || '').toLowerCase() === email.toLowerCase()) || null
}

;(async () => {
  const out = {}
  for (const a of ACCOUNTS) {
    let au = await findAuthUser(a.email)
    if (!au) {
      const { data, error } = await sb.auth.admin.createUser({
        email: a.email, password: PASS, email_confirm: true,
        user_metadata: { full_name: a.name },
      })
      if (error) { console.log(`FAIL auth ${a.key}: ${error.message}`); continue }
      au = data.user
    } else {
      await sb.auth.admin.updateUserById(au.id, { password: PASS, email_confirm: true })
    }

    // users row — every role except a bare doctor has one; create for all so the
    // patient path and the staff full_name lookup both have something to read.
    let { data: urow } = await sb.from('users').select('id').eq('auth_id', au.id).maybeSingle()
    if (!urow) {
      const { data, error } = await sb.from('users')
        .insert({ auth_id: au.id, email: a.email, full_name: a.name, active_hospital_id: HOSPITAL })
        .select('id').single()
      if (error) { console.log(`FAIL users ${a.key}: ${error.message}`); continue }
      urow = data
    }

    if (a.key === 'doctor') {
      const { data: d } = await sb.from('doctors').select('id').eq('auth_user_id', au.id).maybeSingle()
      if (!d) {
        const { error } = await sb.from('doctors').insert({
          user_id: urow.id, auth_user_id: au.id, hospital_id: HOSPITAL, specialty_id: SPECIALTY,
          full_name: a.name, email: a.email, title: 'Dr.', is_active: true,
        })
        if (error) console.log(`FAIL doctors: ${error.message}`)
      }
    }

    if (a.key === 'hospital') {
      const { data: s } = await sb.from('hospital_admins').select('id').eq('user_id', urow.id).maybeSingle()
      if (!s) {
        const { error } = await sb.from('hospital_admins').insert({
          hospital_id: HOSPITAL, user_id: urow.id, role: 'front_desk', is_active: true,
        })
        if (error) console.log(`FAIL hospital_admins: ${error.message}`)
      }
    }

    if (a.key === 'crew') {
      const { data: c } = await sb.from('ambulance_crew').select('id').eq('user_id', urow.id).maybeSingle()
      if (!c) {
        const { error } = await sb.from('ambulance_crew').insert({
          user_id: urow.id, provider_id: PROVIDER, crew_role: 'paramedic', crew_tier: 'ALS', is_active: true,
        })
        if (error) console.log(`FAIL ambulance_crew: ${error.message}`)
      }
    }

    out[a.key] = { email: a.email, authId: au.id, userId: urow.id }
    console.log(`ok ${a.key.padEnd(9)} ${a.email}`)
  }
  require('fs').writeFileSync('/Users/apple/queue/scripts/e2e/accounts.json',
    JSON.stringify({ password: PASS, accounts: out }, null, 2))
})()
