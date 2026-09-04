import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/supabase/auth-server'
import { Errors } from '@/lib/api-error'
import { AUTH_CORS_HEADERS, corsOptions } from '@/lib/cors'

// Called cross-origin by the Queue Hospital app running in a browser
// (localhost:8096 -> localhost:3000) -- needs real CORS handling (preflight
// OPTIONS + headers on every response), same as virtual/token and onboarding.
// This route's auth already correctly forwards `req` to requireRole (so a
// Bearer-token mobile caller resolves fine) -- CORS was the only gap, and
// without it HospitalSettingsScreen's save action has been silently failing
// with "Failed to fetch" on any browser build of the hospital app.
export async function OPTIONS() {
  return corsOptions()
}

export interface DayHours { day: number; open: string; close: string; closed: boolean }

// Mirrors onboarding's defaultHours: Mon–Sat 08:00–18:00 open, Sunday closed
function defaultHours(): DayHours[] {
  return Array.from({ length: 7 }, (_, day) => ({
    day, open: '08:00', close: '18:00', closed: day === 0,
  }))
}

function fillHours(rows: { day_of_week: number; open_time: string; close_time: string; is_closed: boolean | null }[]): DayHours[] {
  const byDay = new Map(rows.map(r => [r.day_of_week, r]))
  return defaultHours().map(d => {
    const r = byDay.get(d.day)
    if (!r) return d
    return { day: d.day, open: r.open_time.slice(0, 5), close: r.close_time.slice(0, 5), closed: r.is_closed ?? false }
  })
}

function assertOwnHospital(caller: { role: string; hospitalId?: string }, hospitalId: string) {
  return caller.role === 'super_admin' || caller.hospitalId === hospitalId
}

// The settings a hospital admin may edit. Single source of truth for both the
// GET projection and the PATCH whitelist, so the two can't drift — and so PATCH
// can never write a column outside this list (it previously spread the request
// body straight into the UPDATE, which allowed writing *any* hospitals column,
// including platform-controlled trust flags like is_verified).
// Read-only on this endpoint: payout details are managed through
// /api/payments/subaccount, which resolves the account name with Paystack first.
const PAYOUT_FIELDS = ['paystack_subaccount_code', 'paystack_bank_name', 'paystack_account_last4'] as const

const EDITABLE_SETTINGS = [
  'accepts_virtual', 'emergency_hours', 'is_24_hours', 'daily_booking_limit',
  'approval_mode', 'requires_referral', 'opd_fee', 'latitude', 'longitude',
  'sms_reminders', 'email_reminders', 'ambulance_private_fleet',
  'ambulance_service_radius_m', 'ambulance_service_hours_247',
] as const

// GET/PATCH /api/hospitals/[id]/settings -- replaces admin-api.ts's
// getHospitalSettings/updateHospitalSettings/getHospitalHours/
// updateHospitalHours (Task 15). Restricted to the roles that actually see
// the settings page (Sidebar only links to it for super_admin/hospital_admin).
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const res = await handleGET(req, ctx)
  for (const [k, v] of Object.entries(AUTH_CORS_HEADERS)) res.headers.set(k, v)
  return res
}

async function handleGET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(['super_admin', 'hospital_admin'], req)
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  const { id } = await params
  if (!assertOwnHospital(caller, id)) return Errors.forbidden()
  const db = createAdminClient()

  const [{ data: settings }, { data: hoursRows }] = await Promise.all([
    db.from('hospitals')
      .select([...EDITABLE_SETTINGS, ...PAYOUT_FIELDS].join(', '))
      .eq('id', id)
      .single(),
    db.from('hospital_operating_hours').select('day_of_week, open_time, close_time, is_closed').eq('hospital_id', id),
  ])

  return NextResponse.json({
    settings,
    hours: fillHours(hoursRows ?? []),
  })
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const res = await handlePATCH(req, ctx)
  for (const [k, v] of Object.entries(AUTH_CORS_HEADERS)) res.headers.set(k, v)
  return res
}

async function handlePATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(['super_admin', 'hospital_admin'], req)
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  const { id } = await params
  if (!assertOwnHospital(caller, id)) return Errors.forbidden()
  const db = createAdminClient()

  const body = await req.json() as { hours?: DayHours[]; settings?: Record<string, unknown> } & Record<string, unknown>
  const { hours } = body

  // Two client shapes in the wild: the web settings page PATCHes the fields flat
  // at the top level, mobile's HospitalSettingsScreen nests them under `settings`.
  // The nested form used to land in the UPDATE as a literal `settings` column and
  // fail outright, so mobile could never save settings at all.
  const incoming: Record<string, unknown> = {
    ...(body.settings && typeof body.settings === 'object' ? body.settings : {}),
    ...body,
  }

  const updates: Record<string, unknown> = {}
  for (const key of EDITABLE_SETTINGS) {
    if (incoming[key] !== undefined) updates[key] = incoming[key]
  }

  if (Object.keys(updates).length > 0) {
    const { error } = await db.from('hospitals').update(updates as any).eq('id', id)
    if (error) return Errors.internal(error.message)
  }

  if (hours) {
    const rows = hours.map(h => ({
      hospital_id: id, day_of_week: h.day, open_time: h.open, close_time: h.close, is_closed: h.closed,
    }))
    const { error } = await db
      .from('hospital_operating_hours')
      .upsert(rows, { onConflict: 'hospital_id,day_of_week' })
    if (error) return Errors.internal(error.message)
  }

  return NextResponse.json({ success: true })
}
