/**
 * The browser-facing Supabase key, in one place.
 *
 * Reads NEXT_PUBLIC_SUPABASE_PUBLIC_KEY (an sb_publishable_ key).
 *
 * Why this exists: the service_role key leaked into a public repo on 2026-07-26.
 * It is a legacy JWT signed by the project JWT secret — the same secret that
 * signs the legacy anon key — so the leaked key cannot be revoked on its own.
 * Disabling legacy API keys is the only way to kill it, and that invalidates
 * legacy anon too. Everything browser-facing therefore has to be able to run on
 * a publishable key before legacy can be switched off.
 *
 * Legacy keys were disabled on 2026-08-10, which killed the leaked service_role
 * key. The legacy anon fallback that carried this through the migration is gone
 * with it: keeping it would mean a missing PUBLIC_KEY silently falls through to
 * a key the server now rejects, turning a clear startup error into a confusing
 * runtime 401.
 *
 * Both values are public by design — a publishable key grants exactly what anon
 * granted, with RLS still enforced. Verified against production: it can read the
 * hospital directory but not users, appointments or patient_medical_history.
 */
export function supabasePublicKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLIC_KEY
  if (!key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_PUBLIC_KEY (the sb_publishable_ key)')
  }
  return key
}
