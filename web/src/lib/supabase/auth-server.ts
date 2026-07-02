import { cookies } from 'next/headers'
import { adminDb } from './admin-client'

function decodeAndParseSession(raw: string): string | null {
  try {
    const decoded = raw.startsWith('base64-')
      ? Buffer.from(raw.slice(7).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
      : raw
    const session = JSON.parse(decoded)
    return session?.access_token ?? null
  } catch {
    return null
  }
}

// Extract JWT from the auth cookie without creating a GoTrueClient.
// Falls back to chunked cookies when the un-chunked cookie is corrupt.
export async function getServerUser() {
  const cookieStore = await cookies()
  const allCookies = cookieStore.getAll()

  const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/\/\/([^.]+)/)?.[1] ?? ''
  const cookieKey = `sb-${projectRef}-auth-token`

  let jwt: string | null = null

  // Try un-chunked direct cookie first
  const direct = allCookies.find(c => c.name === cookieKey)?.value
  if (direct) {
    jwt = decodeAndParseSession(direct)
  }

  // If direct was absent or corrupt, try chunked cookies
  if (!jwt) {
    const parts: string[] = []
    for (let i = 0; i < 10; i++) {
      const chunk = allCookies.find(c => c.name === `${cookieKey}.${i}`)?.value
      if (!chunk) break
      parts.push(chunk)
    }
    if (parts.length) {
      jwt = decodeAndParseSession(parts.join(''))
    }
  }

  if (!jwt) return null

  const { data: { user }, error } = await adminDb.auth.getUser(jwt)
  if (error || !user) return null
  return user
}
