import { NextResponse, type NextRequest } from 'next/server'

const PROJECT_REF = process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/\/\/([^.]+)/)?.[1] ?? ''
const AUTH_COOKIE = `sb-${PROJECT_REF}-auth-token`

function decodeValue(value: string): string {
  if (value.startsWith('base64-')) {
    return Buffer.from(
      value.slice(7).replace(/-/g, '+').replace(/_/g, '/'),
      'base64'
    ).toString('utf8')
  }
  return value
}

function isValidJson(value: string | undefined | null): boolean {
  if (!value) return false
  try {
    const parsed = JSON.parse(decodeValue(value))
    return typeof parsed === 'object' && parsed !== null
  } catch {
    return false
  }
}

/** Returns { direct, chunked } — the raw values of each cookie form. */
function getSessionCookies(request: NextRequest) {
  const direct = request.cookies.get(AUTH_COOKIE)?.value ?? null

  const parts: string[] = []
  for (let i = 0; i < 10; i++) {
    const chunk = request.cookies.get(`${AUTH_COOKIE}.${i}`)?.value
    if (!chunk) break
    parts.push(chunk)
  }
  const chunked = parts.length > 0 ? parts.join('') : null

  return { direct, chunked }
}

function clearAllAuthCookies(response: NextResponse, request: NextRequest) {
  request.cookies.getAll()
    .filter(c => c.name.startsWith('sb-'))
    .forEach(c => response.cookies.set(c.name, '', { maxAge: 0, path: '/' }))
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const { direct, chunked } = getSessionCookies(request)

  const directValid  = isValidJson(direct)
  const chunkedValid = isValidJson(chunked)

  // If un-chunked cookie is corrupt but chunked cookies are valid:
  // self-healing redirect — delete the corrupt cookie, redirect to same URL.
  // The browser processes the Set-Cookie BEFORE following the redirect, so the
  // next request arrives clean and the application code never sees the bad cookie.
  if (direct && !directValid && chunkedValid) {
    const response = NextResponse.redirect(request.url)
    response.cookies.set(AUTH_COOKIE, '', { maxAge: 0, path: '/' })
    return response
  }

  // If both forms exist and both are invalid (or only direct exists and invalid):
  // clear everything and redirect to login.
  if (direct && !directValid && !chunkedValid) {
    const response = NextResponse.redirect(new URL('/login', request.url))
    clearAllAuthCookies(response, request)
    return response
  }

  // Determine effective session validity
  // @supabase/ssr combineChunks prefers direct cookie; we do the same.
  const hasValidSession = directValid || chunkedValid

  const isAuthRoute      = pathname.startsWith('/login') || pathname.startsWith('/register')
  const isDashboardRoute = pathname.startsWith('/dashboard')
  const isOnboarding     = pathname.startsWith('/onboarding')

  if (!hasValidSession && (isDashboardRoute || isOnboarding)) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (hasValidSession && isAuthRoute) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/.*|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
