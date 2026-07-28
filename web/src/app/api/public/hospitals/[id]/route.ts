import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { HOSPITAL_SELECT, PUBLIC_CORS_HEADERS } from '@/lib/public-hospital-select'

export const revalidate = 60

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: PUBLIC_CORS_HEADERS })
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const db = createAdminClient()
  const { data, error } = await db
    .from('hospitals')
    .select(HOSPITAL_SELECT)
    .eq('id', id)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Hospital not found' }, { status: 404, headers: PUBLIC_CORS_HEADERS })
  }

  return NextResponse.json(data, {
    headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300', ...PUBLIC_CORS_HEADERS },
  })
}
