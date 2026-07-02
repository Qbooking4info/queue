import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin') ?? 'http://localhost:3000'
  const res = NextResponse.redirect(new URL('/login', origin), { status: 302 })
  // Clear all Supabase auth cookies
  const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL?.match(/\/\/([^.]+)/)?.[1] ?? ''
  const base = `sb-${projectRef}-auth-token`
  ;[base, `${base}.0`, `${base}.1`, `${base}.2`].forEach(name => {
    res.cookies.set(name, '', { maxAge: 0, path: '/' })
  })
  return res
}
