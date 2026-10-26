/**
 * Tokens from an implicit-flow password-recovery link
 * (`/reset-password#access_token=…&refresh_token=…&type=recovery`).
 *
 * The mobile apps request resets with supabase-js's default implicit flow, so the
 * emailed link returns tokens in the URL fragment. The web browser client is PKCE
 * only and ignores a fragment, which left /reset-password on "Verifying reset
 * link…" forever for every patient who tapped "Forgot password". The page reads
 * the fragment itself with this and calls setSession().
 */
export function parseRecoveryHash(hash: string): { accessToken: string; refreshToken: string } | null {
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash)
  const accessToken = params.get('access_token')
  const refreshToken = params.get('refresh_token')
  if (!accessToken || !refreshToken) return null
  // Only recovery links. A magic-link/invite fragment arriving here is not a
  // password reset and must not be treated as one.
  if (params.get('type') !== 'recovery') return null
  return { accessToken, refreshToken }
}
