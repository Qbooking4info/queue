import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/supabase/auth-server'
import { Errors } from '@/lib/api-error'
import { safePatientName, fmtLocalDate } from '@/lib/dashboard-utils'

interface ScheduleSlot {
  id: string
  date: string
  time: string
  doc: string
  patient: string
  type: string
  status: string
  urgency: string
}
interface DayHours { day: number; open: string; close: string; closed: boolean }

function defaultHours(): DayHours[] {
  return Array.from({ length: 7 }, (_, day) => ({ day, open: '08:00', close: '18:00', closed: day === 0 }))
}
function fillHours(rows: { day_of_week: number; open_time: string; close_time: string; is_closed: boolean }[]): DayHours[] {
  const byDay = new Map(rows.map(r => [r.day_of_week, r]))
  return defaultHours().map(d => {
    const r = byDay.get(d.day)
    if (!r) return d
    return { day: d.day, open: r.open_time.slice(0, 5), close: r.close_time.slice(0, 5), closed: r.is_closed }
  })
}

// GET /api/schedule?weekStart&doctorId&clinicId -- replaces admin-api.ts's
// getWeekAppointments/getHospitalHours/getClinicHours (Task 15). Scoped to
// the caller's own hospital; doctor callers are forced onto their own
// doctorId regardless of any doctorId query param.
export async function GET(req: NextRequest) {
  const auth = await requireRole(['super_admin', 'hospital_admin', 'clinic_admin', 'front_desk', 'doctor'])
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  if (!caller.hospitalId) return Errors.forbidden()
  const hospitalId = caller.hospitalId
  const db = createAdminClient()

  const { searchParams } = new URL(req.url)
  const weekStart = searchParams.get('weekStart')
  const doctorId = caller.role === 'doctor' ? caller.doctorId : (searchParams.get('doctorId') ?? undefined)
  const clinicId = searchParams.get('clinicId') ?? undefined

  const anchor = weekStart ? new Date(weekStart + 'T00:00:00') : new Date()
  const day = anchor.getDay()
  const monday = new Date(anchor)
  monday.setDate(anchor.getDate() - (day === 0 ? 6 : day - 1))
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)

  let q = (db as any)
    .from('appointments')
    .select(`
      id, appointment_date, start_time, type, status, urgency,
      patient:users!appointments_patient_id_fkey(full_name),
      doctor:doctors!appointments_doctor_id_fkey(full_name)
    `)
    .eq('hospital_id', hospitalId)
    .gte('appointment_date', fmtLocalDate(monday))
    .lte('appointment_date', fmtLocalDate(sunday))
    .neq('status', 'cancelled')
    .order('start_time')
  if (doctorId) q = q.eq('doctor_id', doctorId)
  if (clinicId) q = q.eq('clinic_id', clinicId)
  const { data } = await q

  const schedule: Record<string, ScheduleSlot[]> = {}
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday); d.setDate(monday.getDate() + i)
    schedule[fmtLocalDate(d)] = []
  }
  for (const a of (data ?? []) as any[]) {
    const bucket = schedule[a.appointment_date]
    if (!bucket) continue
    bucket.push({
      id: a.id,
      date: a.appointment_date,
      time: (a.start_time ?? '').slice(0, 5),
      doc: a.doctor?.full_name ?? 'Doctor',
      patient: safePatientName(a.patient?.full_name, 'Patient'),
      type: a.type,
      status: a.status,
      urgency: a.urgency ?? 'routine',
    })
  }

  let hours: DayHours[]
  if (clinicId) {
    const { data: clinicHoursRows } = await (db as any)
      .from('hospital_clinic_hours').select('day_of_week, open_time, close_time, is_closed').eq('clinic_id', clinicId)
    if ((clinicHoursRows ?? []).length > 0) {
      hours = fillHours(clinicHoursRows)
    } else {
      const { data: hospitalHoursRows } = await (db as any)
        .from('hospital_operating_hours').select('day_of_week, open_time, close_time, is_closed').eq('hospital_id', hospitalId)
      hours = fillHours(hospitalHoursRows ?? [])
    }
  } else {
    const { data: hospitalHoursRows } = await (db as any)
      .from('hospital_operating_hours').select('day_of_week, open_time, close_time, is_closed').eq('hospital_id', hospitalId)
    hours = fillHours(hospitalHoursRows ?? [])
  }

  return NextResponse.json({ schedule, hours })
}
