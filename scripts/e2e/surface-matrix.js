// Exercises the real sign-in path (anon key, same queries/RPCs as AuthContext) for every
// account x surface pair. This is the regression test for the failure the user hit:
// a doctor being turned away from their own app because the surface defaulted to patient.
process.loadEnvFile('/Users/apple/queue/web/.env.local')
const { createClient } = require('/Users/apple/queue/web/node_modules/@supabase/supabase-js')
const fs = require('fs')

const { password, accounts } = JSON.parse(fs.readFileSync('/Users/apple/queue/scripts/e2e/accounts.json'))
const URL  = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLIC_KEY
const SURFACES = ['patient', 'hospital', 'doctor', 'crew']

// Mirrors AuthContext.fetchProfile: doctors read directly (RLS), staff/crew via
// SECURITY DEFINER RPCs — direct table reads are blocked for those and fail silently.
async function resolveKind(sb, authId) {
  const { data: urow } = await sb.from('users').select('*').eq('auth_id', authId).maybeSingle()

  const { data: doc } = await sb.from('doctors')
    .select('id, hospital_id, full_name, specialty_id')
    .eq('auth_user_id', authId).eq('is_active', true).maybeSingle()
  if (doc) return { kind: 'doctor', detail: doc.full_name }

  const { data: staff, error: se } = await sb.rpc('get_my_staff_profile')
  const staffRow  = Array.isArray(staff) ? staff[0] : staff
  const staffRole = staffRow?.staff_role ?? null

  const { data: crew } = await sb.rpc('get_my_crew_profile')
  const crewRow = Array.isArray(crew) ? crew[0] : crew

  const isCrew  = !!crewRow || staffRole === 'ambulance_crew'
  const isStaff = !!staffRole && staffRole !== 'ambulance_crew'
  if (isCrew)  return { kind: 'crew',  detail: crewRow?.crew_role ?? staffRole }
  if (isStaff) return { kind: 'hospital', detail: staffRole }
  return { kind: 'patient', detail: urow?.full_name ?? '(no users row)', staffErr: se?.message }
}

;(async () => {
  const results = []
  for (const [role, acct] of Object.entries(accounts)) {
    const sb = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error } = await sb.auth.signInWithPassword({ email: acct.email, password })
    if (error) { console.log(`AUTH FAIL ${role}: ${error.message}`); continue }

    const { kind, detail } = await resolveKind(sb, data.user.id)
    for (const surface of SURFACES) {
      const allowed = kind === surface       // escape hatches need registered_via; none set here
      results.push({ role, surface, kind, allowed, expected: surface === role, detail })
    }
    await sb.auth.signOut()
  }

  let pass = 0, fail = 0
  console.log('\naccount    surface    resolved   allowed  expected  result')
  console.log('-'.repeat(64))
  for (const r of results) {
    const ok = r.allowed === r.expected
    ok ? pass++ : fail++
    console.log(
      `${r.role.padEnd(10)} ${r.surface.padEnd(10)} ${r.kind.padEnd(10)} ` +
      `${String(r.allowed).padEnd(8)} ${String(r.expected).padEnd(9)} ${ok ? 'PASS' : 'FAIL'}`
    )
  }
  console.log('-'.repeat(64))
  console.log(`${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
})()
