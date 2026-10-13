// "Continue with Google" through Supabase Auth. Opens Google in an auth session,
// comes back on queue://auth-callback, and turns the result into a Supabase session.
//
// Needs, outside the code (once): Google provider enabled in Supabase Auth with a
// Google Cloud OAuth client, and `queue://auth-callback` added to Supabase's
// redirect allow-list. Until then this returns Supabase's error message.
import * as WebBrowser from 'expo-web-browser'
import * as Linking from 'expo-linking'
import { supabase } from './supabase'

WebBrowser.maybeCompleteAuthSession()

function paramsFrom(url: string): Record<string, string> {
  const out: Record<string, string> = {}
  const parts = [url.split('?')[1]?.split('#')[0], url.split('#')[1]].filter(Boolean) as string[]
  for (const part of parts) {
    for (const kv of part.split('&')) {
      const [k, v] = kv.split('=')
      if (k) out[decodeURIComponent(k)] = decodeURIComponent(v ?? '')
    }
  }
  return out
}

/** Returns null on success or when the user backs out; an error message otherwise. */
export async function signInWithGoogle(): Promise<string | null> {
  const redirectTo = Linking.createURL('auth-callback')
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
  })
  if (error || !data?.url) return error?.message ?? 'Google sign-in is not available right now.'

  const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo)
  if (res.type !== 'success') return null   // closed or cancelled: not an error

  const p = paramsFrom(res.url)
  if (p.error_description || p.error) return p.error_description || p.error

  if (p.code) {
    const { error: e } = await supabase.auth.exchangeCodeForSession(p.code)
    if (e) return e.message
  } else if (p.access_token && p.refresh_token) {
    const { error: e } = await supabase.auth.setSession({ access_token: p.access_token, refresh_token: p.refresh_token })
    if (e) return e.message
  } else {
    return 'Google sign-in did not return a session.'
  }

  // First Google sign-in: create the patient profile row (email sign-up does this in
  // AuthContext.signUp). Then refresh the session so AuthContext reloads the profile.
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    const { data: existing } = await supabase.from('users').select('id').eq('auth_id', user.id).maybeSingle()
    if (!existing) {
      const meta = user.user_metadata ?? {}
      const { error: insErr } = await supabase.from('users').insert({
        auth_id: user.id,
        email: user.email ?? '',
        full_name: meta.full_name || meta.name || (user.email ?? 'Queue user').split('@')[0],
        phone: null,
        date_of_birth: null,
      } as any)
      if (insErr) { await supabase.auth.signOut(); return insErr.message }
      // avatar_url is update-only for clients (20260816000002), so set it after the insert.
      const photo = meta.avatar_url || meta.picture
      if (photo) await supabase.from('users').update({ avatar_url: photo }).eq('auth_id', user.id)
      await supabase.auth.refreshSession()
    }
  }
  return null
}
