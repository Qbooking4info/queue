import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/supabase/auth-server'
import { Errors } from '@/lib/api-error'

// Every hospital the caller has EVER been linked to as a doctor -- active or
// detached -- for the dashboard's hospital-affiliation filter. Deliberately
// not filtered to is_active=true (that's what every other doctor-facing query
// in this app already does, e.g. HospitalsScreen's hospital switcher) since
// the whole point here is letting a doctor look back at a past affiliation's
// stats, not just their current one.
export async function GET() {
  const auth = await requireRole(['doctor'])
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  const db = createAdminClient()

  const { data: profile } = await db.from('users').select('id').eq('auth_id', caller.authId).single()

  const { data: rows, error } = await db
    .from('doctors')
    .select('hospital_id, is_active, hospital:hospitals!doctors_hospital_id_fkey(name)')
    .or(`auth_user_id.eq.${caller.authId}${profile ? `,user_id.eq.${profile.id}` : ''}`)
  if (error) return Errors.internal(error.message)

  const hospitals = ((rows ?? []) as any[])
    .map(r => ({ hospitalId: r.hospital_id, hospitalName: r.hospital?.name ?? 'Unknown hospital', isActive: !!r.is_active }))
    .sort((a, b) => (a.isActive === b.isActive ? a.hospitalName.localeCompare(b.hospitalName) : a.isActive ? -1 : 1))

  return NextResponse.json({ hospitals })
}
