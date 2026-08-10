/**
 * The browser-facing Supabase key, in one place.
 *
 * Prefers NEXT_PUBLIC_SUPABASE_PUBLIC_KEY (an sb_publishable_ key) and falls
 * back to NEXT_PUBLIC_SUPABASE_ANON_KEY (the legacy anon JWT).
 *
 * Why this exists: the service_role key leaked into a public repo on 2026-07-26.
 * It is a legacy JWT signed by the project JWT secret — the same secret that
 * signs the legacy anon key — so the leaked key cannot be revoked on its own.
 * Disabling legacy API keys is the only way to kill it, and that invalidates
 * legacy anon too. Everything browser-facing therefore has to be able to run on
 * a publishable key before legacy can be switched off.
 *
 * The fallback makes that a rolling change rather than a flag day: this code can
 * deploy while Vercel still only has the old variable set, and start using the
 * publishable key the moment the new one appears. Once legacy keys are disabled,
 * drop the fallback and the ANON_KEY variable.
 *
 * Both values are public by design — a publishable key grants exactly what anon
 * granted, with RLS still enforced. Verified against production: it can read the
 * hospital directory but not users, appointments or patient_medical_history.
 */
export function supabasePublicKey(): string {
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLIC_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!key) {
    throw new Error(
      'Missing Supabase browser key: set NEXT_PUBLIC_SUPABASE_PUBLIC_KEY (preferred) or NEXT_PUBLIC_SUPABASE_ANON_KEY',
    )
  }
  return key
}
