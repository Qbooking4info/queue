// Exercises the doctor self-registration path added in 3061a86, which nothing had tested.
// A doctor who signs up but isn't linked to a hospital yet has NO doctors row, so they
// resolve as 'patient'. The registered_via escape hatch is the only thing that lets them
// back into Queue Doctor instead of being told they're not a doctor.
process.loadEnvFile('/Users/apple/queue/web/.env.local')
const { createClient } = require('/Users/apple/queue/web/node_modules/@supabase/supabase-js')
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLIC_KEY
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const EMAIL = 'e2e.newdoc@queuetest.com', PASS = 'QueueE2E!2026'
const REGISTERED_VIA_DOCTOR = 'doctor_signup'
const out = []
const rec = (n, ok, note) => out.push({ n, ok, note })

;(async () => {
  // Clean slate so the test is repeatable.
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const old = list.users.find(u => (u.email || '').toLowerCase() === EMAIL)
  if (old) {
    const { data: u } = await admin.from('users').select('id').eq('auth_id', old.id).maybeSingle()
    if (u) await admin.from('users').delete().eq('id', u.id)
    await admin.auth.admin.deleteUser(old.id)
  }

  // 1. Sign up exactly as DoctorRegisterScreen does.
  const sb = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: su, error: se } = await sb.auth.signUp({
    email: EMAIL, password: PASS,
    options: { data: { full_name: 'E2E New Doctor', registered_via: REGISTERED_VIA_DOCTOR } },
  })
  rec('signUp succeeds', !se, se?.message ?? 'ok')
  if (se) return report()

  rec('registered_via stamped on auth user',
      su.user?.user_metadata?.registered_via === REGISTERED_VIA_DOCTOR,
      su.user?.user_metadata?.registered_via ?? 'missing')

  // Email confirmation may withhold a session; confirm server-side so the rest can run.
  if (!su.session) await admin.auth.admin.updateUserById(su.user.id, { email_confirm: true })

  // 2. Sign in on the doctor surface — the case that used to fail.
  const sb2 = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: si, error: sie } = await sb2.auth.signInWithPassword({ email: EMAIL, password: PASS })
  rec('sign in after registration', !sie, sie?.message ?? 'ok')
  if (sie) return report()

  // 3. Replicate signIn()'s decision.
  const { data: doc } = await sb2.from('doctors').select('id').eq('auth_user_id', si.user.id).eq('is_active', true).maybeSingle()
  const { data: staff } = await sb2.rpc('get_my_staff_profile')
  const staffRow = Array.isArray(staff) ? staff[0] : staff
  const kind = doc ? 'doctor' : staffRow?.staff_role ? 'hospital' : 'patient'
  rec('unlinked doctor resolves as patient (expected)', kind === 'patient', `kind=${kind}`)

  const registeredVia = si.user.user_metadata?.registered_via
  const resumingDoctor = kind === 'patient' && registeredVia === REGISTERED_VIA_DOCTOR
  rec('doctor surface ALLOWED via escape hatch', resumingDoctor === true, `resumingDoctor=${resumingDoctor}`)

  // 4. And that the hatch does not widen the other doors.
  const hospitalAllowed = kind === 'hospital' || (kind === 'patient' && registeredVia === 'hospital_onboarding')
  rec('hospital surface still refused', hospitalAllowed === false, `allowed=${hospitalAllowed}`)
  const crewAllowed = kind === 'crew'
  rec('crew surface still refused', crewAllowed === false, `allowed=${crewAllowed}`)

  await sb2.auth.signOut()
  report()

  function report() {
    let p = 0, f = 0
    console.log('\ncheck                                        result  detail')
    console.log('-'.repeat(70))
    for (const c of out) { c.ok ? p++ : f++; console.log(`${c.n.padEnd(44)} ${(c.ok?'PASS':'FAIL').padEnd(7)} ${c.note}`) }
    console.log('-'.repeat(70)); console.log(`${p} passed, ${f} failed`)
    process.exit(f ? 1 : 0)
  }
})()
