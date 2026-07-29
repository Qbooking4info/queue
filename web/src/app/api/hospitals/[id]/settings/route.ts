import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/supabase/auth-server'
import { Errors } from '@/lib/api-error'

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

// GET/PATCH /api/hospitals/[id]/settings -- replaces admin-api.ts's
// getHospitalSettings/updateHospitalSettings/getHospitalHours/
// updateHospitalHours (Task 15). Restricted to the roles that actually see
// the settings page (Sidebar only links to it for super_admin/hospital_admin).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(['super_admin', 'hospital_admin'])
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  const { id } = await params
  if (!assertOwnHospital(caller, id)) return Errors.forbidden()
  const db = createAdminClient()

  const [{ data: settings }, { data: hoursRows }] = await Promise.all([
    db.from('hospitals')
      .select('accepts_virtual, emergency_hours, is_24_hours, daily_booking_limit, approval_mode, requires_referral, opd_fee, latitude, longitude, sms_reminders, email_reminders, ambulance_private_fleet, ambulance_service_radius_m, ambulance_service_hours_247')
      .eq('id', id)
      .single(),
    db.from('hospital_operating_hours').select('day_of_week, open_time, close_time, is_closed').eq('hospital_id', id),
  ])

  return NextResponse.json({
    settings,
    hours: fillHours(hoursRows ?? []),
  })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(['super_admin', 'hospital_admin'])
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  const { id } = await params
  if (!assertOwnHospital(caller, id)) return Errors.forbidden()
  const db = createAdminClient()

  const body = await req.json()
  const { hours, ...settings } = body as { hours?: DayHours[] } & Record<string, unknown>

  if (Object.keys(settings).length > 0) {
    const { error } = await db.from('hospitals').update(settings as any).eq('id', id)
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
