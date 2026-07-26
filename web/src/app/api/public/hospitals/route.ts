import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { HOSPITAL_SELECT } from '@/lib/public-hospital-select'

export const revalidate = 60

// Public, unauthenticated directory listing — mirrors the query mobile used
// to run directly against Supabase. Cached at the edge (60s) since hospital
// listings (names, ratings, specialties) change on the order of hours, not
// seconds; this takes the highest-volume read off Postgres/PostgREST.
export async function GET(req: NextRequest) {
  const search = req.nextUrl.searchParams.get('search')?.trim()

  const db = createAdminClient()
  let query = db
    .from('hospitals')
    .select(HOSPITAL_SELECT)
    .eq('is_active', true)
    .order('avg_rating', { ascending: false })

  if (search) {
    query = query.ilike('name', `%${search}%`)
  }

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: 'Failed to load hospitals' }, { status: 500 })
  }

  return NextResponse.json(data ?? [], {
    headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
  })
}
