import { NextResponse } from 'next/server'

// Visit /api/clear-session to wipe all Supabase auth cookies and redirect to login.
// Useful when a corrupted session cookie causes the server to crash on every request.
export async function GET() {
  const res = NextResponse.redirect(
    process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL('/login', process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000')
      : new URL('http://localhost:3000/login'),
    { status: 302 }
  )

  // Delete all sb-* cookies (Supabase auth tokens)
  ;['sb-access-token', 'sb-refresh-token',
    `sb-${process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/\/\/([^.]+)/)?.[1]}-auth-token`,
    `sb-${process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/\/\/([^.]+)/)?.[1]}-auth-token.0`,
    `sb-${process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/\/\/([^.]+)/)?.[1]}-auth-token.1`,
  ].forEach(name => {
    if (name) res.cookies.set(name, '', { maxAge: 0, path: '/' })
  })

  return res
}
