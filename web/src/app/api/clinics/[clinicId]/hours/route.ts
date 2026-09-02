import { createAdminClient } from '@/lib/supabase/admin'
import { getServerUser } from '@/lib/supabase/auth-server'
import { NextRequest, NextResponse } from 'next/server'
import { fillDayHours } from '@/lib/operating-hours'
import { AUTH_CORS_HEADERS, corsOptions } from '@/lib/cors'

// Called cross-origin by the Queue Hospital app running in a browser
// (localhost:8096 -> localhost:3000) -- needs real CORS handling (preflight
// OPTIONS + headers on every response), same as virtual/token and onboarding.
export async function OPTIONS() {
  return corsOptions()
}

// GET /api/clinics/[clinicId]/hours -- any authenticated user, not ownership-gated
// (unlike /api/clinics/[clinicId] itself, which is for a clinic managing its own
// settings). Matches /api/clinics?hospitalId=, which already lets any logged-in staff
// list ANY hospital's clinics for the referral flow -- referring a patient to a clinic
// necessarily means reading a clinic you don't belong to.
export async function GET(req: NextRequest, ctx: { params: Promise<{ clinicId: string }> }) {
  const res = await handleGET(req, ctx)
  for (const [k, v] of Object.entries(AUTH_CORS_HEADERS)) res.headers.set(k, v)
  return res
}

async function handleGET(req: NextRequest, { params }: { params: Promise<{ clinicId: string }> }) {
  const user = await getServerUser(req)
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { clinicId } = await params
  const db = createAdminClient()

  const { data } = await db
    .from('hospital_clinic_hours')
    .select('day_of_week, open_time, close_time, is_closed')
    .eq('clinic_id', clinicId)

  const rows = data ?? []
  return NextResponse.json({ hours: fillDayHours(rows), isCustom: rows.length > 0 })
}
