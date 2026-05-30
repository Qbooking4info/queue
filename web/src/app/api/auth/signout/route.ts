import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  await supabase.auth.signOut()
  const origin = req.headers.get('origin') ?? 'http://localhost:3001'
  return NextResponse.redirect(new URL('/login', origin), { status: 302 })
}
