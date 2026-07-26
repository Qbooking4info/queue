// Fails the build if a privileged-looking secret is exposed under NEXT_PUBLIC_.
// NEXT_PUBLIC_* variables are inlined into the client JavaScript bundle by
// Next.js at build time -- anything matching this pattern would ship a
// secret (e.g. the Supabase service_role key, which bypasses RLS on every
// table) to every visitor's browser.
const FORBIDDEN = /^NEXT_PUBLIC_.*(SERVICE|SECRET|PRIVATE|CERTIFICATE|ROLE_KEY)/i
const offenders = Object.keys(process.env).filter((k) => FORBIDDEN.test(k))

if (offenders.length) {
  console.error('\n[env-safety] Secrets exposed to the client bundle:\n')
  offenders.forEach((k) => console.error(`  ${k}`))
  console.error('\nNEXT_PUBLIC_ variables are inlined into client JavaScript.\n')
  process.exit(1)
}

console.log('[env-safety] ok')
