// Exercises each role's real dashboard data path as that authenticated user, using the
// anon key and the same queries/RPCs the screens use. An RLS denial here shows up as an
// error or a silently empty result — the failure mode that passes typecheck and lint.
process.loadEnvFile('/Users/apple/queue/web/.env.local')
const { createClient } = require('/Users/apple/queue/web/node_modules/@supabase/supabase-js')
const { password, accounts } = require('/Users/apple/queue/scripts/e2e/accounts.json')
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL, ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLIC_KEY

const checks = []
const record = (role, name, ok, note) => { checks.push({ role, name, ok, note }); }

async function as(email) {
  const sb = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await sb.auth.signInWithPassword({ email, password })
  if (error) throw new Error(error.message)
  return { sb, uid: data.user.id }
}

;(async () => {
  // ---- patient: browse hospitals and doctors (the booking entry point) ----
  {
    const { sb } = await as(accounts.patient.email)
    const h = await sb.from('hospitals').select('id,name').limit(5)
    record('patient', 'list hospitals', !h.error && (h.data?.length ?? 0) > 0, h.error?.message ?? `${h.data?.length} rows`)
    const d = await sb.from('doctors').select('id,full_name,hospital_id').eq('is_active', true).limit(5)
    record('patient', 'list active doctors', !d.error && (d.data?.length ?? 0) > 0, d.error?.message ?? `${d.data?.length} rows`)
    const a = await sb.from('appointments').select('id,status').limit(5)
    record('patient', 'read own appointments', !a.error, a.error?.message ?? `${a.data?.length} rows`)
    await sb.auth.signOut()
  }

  // ---- doctor: dashboard appointments ----
  {
    const { sb, uid } = await as(accounts.doctor.email)
    const doc = await sb.from('doctors').select('id,hospital_id').eq('auth_user_id', uid).maybeSingle()
    record('doctor', 'resolve own doctors row', !doc.error && !!doc.data, doc.error?.message ?? 'found')
    const ap = await sb.from('appointments').select('id,status,appointment_date').eq('doctor_id', doc.data?.id ?? '').limit(10)
    record('doctor', 'load own appointments', !ap.error, ap.error?.message ?? `${ap.data?.length} rows`)
    await sb.auth.signOut()
  }

  // ---- hospital staff: queue + audit log the front desk reads ----
  {
    const { sb } = await as(accounts.hospital.email)
    const st = await sb.rpc('get_my_staff_profile')
    const row = Array.isArray(st.data) ? st.data[0] : st.data
    record('hospital', 'staff profile RPC', !st.error && !!row?.staff_role, st.error?.message ?? row?.staff_role)
    const ap = await sb.from('appointments').select('id,status').eq('hospital_id', row?.hospital_id ?? '').limit(10)
    record('hospital', 'load hospital queue', !ap.error, ap.error?.message ?? `${ap.data?.length} rows`)
    const va = await sb.from('vitals_audit_log').select('id').limit(3)
    record('hospital', 'read vitals audit log', !va.error, va.error?.message ?? `${va.data?.length} rows`)
    await sb.auth.signOut()
  }

  // ---- crew: the three RPCs the jobs board polls ----
  {
    const { sb } = await as(accounts.crew.email)
    const c = await sb.rpc('get_my_crew_profile')
    record('crew', 'crew profile RPC', !c.error, c.error?.message ?? 'ok')
    const u = await sb.rpc('get_my_units')
    record('crew', 'get_my_units', !u.error, u.error?.message ?? `${(u.data ?? []).length} units`)
    const o = await sb.rpc('get_my_pending_offers')
    record('crew', 'get_my_pending_offers', !o.error, o.error?.message ?? `${(o.data ?? []).length} offers`)
    const j = await sb.rpc('get_my_active_job')
    record('crew', 'get_my_active_job', !j.error, j.error?.message ?? 'ok')
    await sb.auth.signOut()
  }

  let pass = 0, fail = 0
  console.log('\nrole       check                       result  detail')
  console.log('-'.repeat(72))
  for (const c of checks) {
    c.ok ? pass++ : fail++
    console.log(`${c.role.padEnd(10)} ${c.name.padEnd(27)} ${(c.ok ? 'PASS' : 'FAIL').padEnd(7)} ${c.note ?? ''}`)
  }
  console.log('-'.repeat(72))
  console.log(`${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})()
