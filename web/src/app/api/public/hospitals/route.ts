import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { HOSPITAL_SELECT, PUBLIC_CORS_HEADERS } from '@/lib/public-hospital-select'

export const revalidate = 60

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: PUBLIC_CORS_HEADERS })
}

// Public, unauthenticated directory listing — mirrors the query mobile used
// to run directly against Supabase. Cached at the edge (60s) since hospital
// listings (names, ratings, specialties) change on the order of hours, not
// seconds; this takes the highest-volume read off Postgres/PostgREST.
export async function GET(req: NextRequest) {
  const search = req.nextUrl.searchParams.get('search')?.trim()
  const specialtyId = req.nextUrl.searchParams.get('specialtyId')?.trim()

  const db = createAdminClient()

  // specialtyId turns the hospital_specialties embed into an INNER join
  // (PostgREST's `!inner` modifier) filtered on that specialty -- restricts
  // to hospitals that have *explicitly registered* the specialty via their
  // dashboard's Services > Specialties tab (hospital_specialties), not any
  // hospital that merely happens to employ a doctor with that specialty --
  // "hospitals that offer X" reads as a hospital-level declaration, not an
  // incidental staffing fact.
  const select = specialtyId
    ? HOSPITAL_SELECT.replace('hospital_specialties(', 'hospital_specialties!inner(')
    : HOSPITAL_SELECT

  let query = db
    .from('hospitals')
    .select(select)
    .eq('is_active', true)
    .order('avg_rating', { ascending: false })

  if (search) {
    query = query.ilike('name', `%${search}%`)
  }
  if (specialtyId) {
    query = query.eq('hospital_specialties.specialty_id', specialtyId)
  }

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: 'Failed to load hospitals' }, { status: 500, headers: PUBLIC_CORS_HEADERS })
  }

  return NextResponse.json(data ?? [], {
    headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300', ...PUBLIC_CORS_HEADERS },
  })
}
