import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { PUBLIC_CORS_HEADERS } from '@/lib/public-hospital-select'
import { fillDayHours } from '@/lib/operating-hours'

export const revalidate = 60

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: PUBLIC_CORS_HEADERS })
}

// GET /api/public/hospitals/[id]/hours -- unauthenticated, same as the sibling
// /api/public/hospitals/[id] route: operating hours aren't sensitive, and this is read
// by any staff member (not necessarily belonging to this hospital) picking a date/time
// for a referral, plus the public booking flow.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = createAdminClient()

  const { data } = await db
    .from('hospital_operating_hours')
    .select('day_of_week, open_time, close_time, is_closed')
    .eq('hospital_id', id)

  return NextResponse.json({ hours: fillDayHours(data ?? []) }, {
    headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300', ...PUBLIC_CORS_HEADERS },
  })
}
