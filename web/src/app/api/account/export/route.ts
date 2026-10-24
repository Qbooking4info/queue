import { NextRequest, NextResponse } from 'next/server'
import { getServerUser } from '@/lib/supabase/auth-server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit } from '@/lib/rate-limit'
import { POLICY_VERSION, RETENTION_SUMMARY } from '@/lib/privacy'
import { AUTH_CORS_HEADERS, corsOptions } from '@/lib/cors'

/**
 * GET /api/account/export — everything this system holds about the caller.
 *
 * NDPR gives a data subject the right to obtain their personal data in a portable
 * form. The app asserted compliance while offering no way to do that; this is that
 * way.
 *
 * Scoped strictly to the caller's own profile id, resolved server-side from their
 * session — never from anything the client sends — so this cannot become a way to
 * read somebody else's record.
 *
 * The retention summary travels with the export on purpose: a person reading their
 * own file should be told what is kept, for how long, and what deletion will and
 * will not remove, at the moment they are most likely to care.
 */


export async function OPTIONS() {
  return corsOptions()
}

export async function GET(req: NextRequest) {
  const res = await handle(req)
  for (const [k, v] of Object.entries(AUTH_CORS_HEADERS)) res.headers.set(k, v)
  return res
}

async function handle(req: NextRequest) {
  // Built per request, not at module scope. A module-scope client is
  // evaluated while Next collects page data at build time, where
  // SUPABASE_SERVICE_ROLE_KEY is absent, and createClient throws
  // 'supabaseKey is required' -- which failed the whole deployment
  // rather than this one route.
  const adminDb = createAdminClient()

  const user = await getServerUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })

  // An export is a heavy read of everything about one person. Rate-limited so a
  // stolen session cannot be used to pull it repeatedly.
  const allowed = await checkRateLimit(adminDb, `account-export:${user.id}`, 5, 3600)
  if (!allowed) {
    return NextResponse.json({ error: 'Too many export requests. Please try again later.' }, { status: 429 })
  }

  const { data: profile } = await adminDb
    .from('users').select('*').eq('auth_id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const id = profile.id

  const [appointments, consents, notifications, insurance, transport, reviews] = await Promise.all([
    adminDb.from('appointments').select('*').eq('patient_id', id),
    adminDb.from('user_consents').select('*').eq('user_id', id),
    adminDb.from('notifications').select('*').eq('user_id', id),
    adminDb.from('user_insurance').select('*').eq('user_id', id),
    adminDb.from('transport_requests').select('*').eq('requester_id', id),
    adminDb.from('reviews').select('*').eq('patient_id', id),
  ])

  // vitals_audit_log is keyed to the appointment, not the patient -- this used
  // to filter on a patient_id column that does not exist, so the whole export
  // failed for everyone. It has to go through the appointment ids above, and
  // therefore after that query rather than alongside it.
  const apptIds = (appointments.data ?? []).map(a => a.id)
  const vitals = apptIds.length
    ? await adminDb.from('vitals_audit_log').select('*').in('appointment_id', apptIds)
    : { data: [], error: null }

  // auth_id is this system's internal link to the login record and is of no use to
  // the person; everything else about them is theirs.
  const { auth_id: _authId, ...exportableProfile } = profile as Record<string, unknown>

  const body = {
    exported_at: new Date().toISOString(),
    policy_version: POLICY_VERSION,
    retention: RETENTION_SUMMARY,
    note:
      'This is every record held about you, keyed to your profile. Deleting your account '
      + 'removes your identity from these records; the clinical content is retained by the '
      + 'hospital that treated you, as health records law requires.',
    profile: exportableProfile,
    appointments: appointments.data ?? [],
    vitals: vitals.data ?? [],
    transport_requests: transport.data ?? [],
    notifications: notifications.data ?? [],
    insurance: insurance.data ?? [],
    reviews: reviews.data ?? [],
    consents: consents.data ?? [],
  }

  const stamp = new Date().toISOString().slice(0, 10)
  return new NextResponse(JSON.stringify(body, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      // Portable form: a file the person can keep, not a page they have to scrape.
      'Content-Disposition': `attachment; filename="queue-my-data-${stamp}.json"`,
    },
  })
}
