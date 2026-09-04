import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/supabase/auth-server'
import { Errors } from '@/lib/api-error'
import { safePatientName, calcAge } from '@/lib/dashboard-utils'
import { AUTH_CORS_HEADERS, corsOptions } from '@/lib/cors'

// Called cross-origin by the Queue Hospital app running in a browser
// (localhost:8096 -> localhost:3000) -- needs real CORS handling (preflight
// OPTIONS + headers on every response), same as virtual/token and onboarding.
export async function OPTIONS() {
  return corsOptions()
}

interface DayHours { day: number; open: string; close: string; closed: boolean }

function defaultHours(): DayHours[] {
  return Array.from({ length: 7 }, (_, day) => ({ day, open: '08:00', close: '18:00', closed: day === 0 }))
}
function fillHours(rows: { day_of_week: number; open_time: string; close_time: string; is_closed: boolean | null }[]): DayHours[] {
  const byDay = new Map(rows.map(r => [r.day_of_week, r]))
  return defaultHours().map(d => {
    const r = byDay.get(d.day)
    if (!r) return d
    return { day: d.day, open: r.open_time.slice(0, 5), close: r.close_time.slice(0, 5), closed: r.is_closed ?? false }
  })
}

async function assertOwnClinic(
  db: ReturnType<typeof createAdminClient>,
  caller: { role: string; hospitalId?: string; clinicId?: string },
  clinicId: string,
): Promise<string | null> {
  const { data: clinic } = await db.from('hospital_clinics').select('hospital_id').eq('id', clinicId).single()
  if (!clinic) return null
  if (caller.role === 'super_admin') return clinic.hospital_id
  if (caller.hospitalId !== clinic.hospital_id) return null
  if (caller.role === 'clinic_admin' && caller.clinicId && caller.clinicId !== clinicId) return null
  return clinic.hospital_id
}

// GET /api/clinics/[clinicId]?from&to -- bundles admin-api.ts's getClinicDetail/
// getClinicDoctors/getClinicStaff/getClinicAppointments/getClinicRangeStats/
// getClinicHours/getHospitalHours into one call (Task 15) -- the page always
// fetched all seven together.
export async function GET(req: NextRequest, ctx: { params: Promise<{ clinicId: string }> }) {
  const res = await handleGET(req, ctx)
  for (const [k, v] of Object.entries(AUTH_CORS_HEADERS)) res.headers.set(k, v)
  return res
}

async function handleGET(req: NextRequest, { params }: { params: Promise<{ clinicId: string }> }) {
  const auth = await requireRole(['super_admin', 'hospital_admin', 'clinic_admin', 'front_desk'], req)
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  const { clinicId } = await params
  const db = createAdminClient()

  const hospitalId = await assertOwnClinic(db, caller, clinicId)
  if (!hospitalId) return Errors.forbidden()

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')

  // Operational -- who is CURRENTLY ACTIVE here, for the appointments/stats
  // queries below. Deliberately NOT membership-based: a doctor merely
  // assigned to this clinic but active elsewhere shouldn't surface in this
  // clinic's queue/appointment activity. Left unchanged by multi-clinic.
  const { data: docs } = await db.from('doctors').select('id').eq('clinic_id', clinicId)
  const doctorIds = (docs as any[] ?? []).map((d: any) => d.id)
  const orFilter = doctorIds.length > 0
    ? `clinic_id.eq.${clinicId},doctor_id.in.(${doctorIds.join(',')})`
    : `clinic_id.eq.${clinicId}`

  // Management -- who is ASSIGNED here (doctor_clinics membership), for the
  // "Doctors in this clinic" panel below, which now shows everyone assigned
  // regardless of where they're currently active (see is_active_here).
  const { data: memberRows } = await db.from('doctor_clinics').select('doctor_id').eq('clinic_id', clinicId)
  const memberIds = (memberRows ?? []).map(m => m.doctor_id)

  const [
    { data: clinic },
    { data: clinicDoctors },
    { data: staffRows },
    apptsResult,
    statsResult,
    { data: clinicHoursRows },
    { data: hospitalHoursRows },
  ] = await Promise.all([
    db.from('hospital_clinics').select('*').eq('id', clinicId).single(),
    memberIds.length > 0
      ? db.from('doctors').select(`
          id, full_name, email, title, avg_rating, review_count, is_active,
          accepts_virtual, consultation_fee, years_experience, clinic_id, availability_status,
          specialty:specialties!doctors_specialty_id_fkey(name)
        `).in('id', memberIds).eq('is_active', true).order('full_name')
      : Promise.resolve({ data: [] as any[] }),
    db.from('clinic_admins').select('id, user_id, role, is_active, created_at, users(full_name, email)')
      .eq('clinic_id', clinicId).eq('is_active', true).order('created_at'),
    from && to
      ? db.from('appointments').select(`
          id, booking_ref, appointment_date, start_time, status, type, reason,
          booking_mode, approval_status, urgency, symptom_description, approval_note,
          assigned_doctor_id, clinic_id, refund_pct, walkin_patient_name, walkin_patient_phone,
          queue_position, estimated_wait, consult_started_at, consult_ended_at, consult_duration_secs, waiting_time_secs, check_in_date,
          patient:users!appointments_patient_id_fkey(id, full_name, date_of_birth, gender),
          doctor:doctors!appointments_doctor_id_fkey(id, full_name, specialty:specialties!doctors_specialty_id_fkey(name)),
          assigned_doctor:doctors!appointments_assigned_doctor_id_fkey(full_name),
          clinic:hospital_clinics!appointments_clinic_id_fkey(name)
        `).eq('hospital_id', hospitalId).gte('appointment_date', from).lte('appointment_date', to)
        .order('appointment_date', { ascending: false }).order('start_time').or(orFilter)
      : Promise.resolve({ data: [] }),
    from && to
      ? Promise.all([
          db.from('appointments').select('id', { count: 'exact', head: true })
            .eq('hospital_id', hospitalId).gte('appointment_date', from).lte('appointment_date', to).or(orFilter),
          db.from('appointments').select('id', { count: 'exact', head: true })
            .eq('hospital_id', hospitalId).gte('appointment_date', from).lte('appointment_date', to).or(orFilter).eq('status', 'completed'),
          db.from('appointments').select('id', { count: 'exact', head: true })
            .eq('hospital_id', hospitalId).gte('appointment_date', from).lte('appointment_date', to).or(orFilter).eq('status', 'cancelled'),
        ])
      : Promise.resolve(null),
    db.from('hospital_clinic_hours').select('day_of_week, open_time, close_time, is_closed').eq('clinic_id', clinicId),
    db.from('hospital_operating_hours').select('day_of_week, open_time, close_time, is_closed').eq('hospital_id', hospitalId),
  ])

  const apptRows = (apptsResult.data ?? []) as any[]
  const appointments = apptRows.map(a => {
    const isWalkin = a.booking_mode === 'walkin'
    return {
      id: a.id, booking_ref: a.booking_ref,
      appointment_date: a.appointment_date,
      start_time: (a.start_time ?? '').slice(0, 5),
      status: a.status, type: a.type, reason: a.reason,
      booking_mode: a.booking_mode ?? 'doctor',
      approval_status: a.approval_status ?? 'auto_approved',
      urgency: a.urgency ?? 'routine',
      symptom_description: a.symptom_description ?? null,
      approval_note: a.approval_note ?? null,
      assigned_doctor_id: a.assigned_doctor_id ?? null,
      assigned_doctor_name: a.assigned_doctor?.full_name ?? null,
      clinic_id: a.clinic_id ?? null,
      clinic_name: a.clinic?.name ?? null,
      refund_pct: a.refund_pct ?? 100,
      walkin_patient_name: a.walkin_patient_name ?? null,
      walkin_patient_phone: a.walkin_patient_phone ?? null,
      queue_position: a.queue_position ?? null,
      estimated_wait: a.estimated_wait ?? null,
      consult_started_at: a.consult_started_at ?? null,
      consult_ended_at: a.consult_ended_at ?? null,
      consult_duration_secs: a.consult_duration_secs ?? null,
      check_in_date: a.check_in_date ?? null,
      patient_id: isWalkin ? null : (a.patient?.id ?? null),
      patient_name: isWalkin ? (a.walkin_patient_name ?? 'Walk-in') : safePatientName(a.patient?.full_name, 'Unknown'),
      patient_age: isWalkin ? null : calcAge(a.patient?.date_of_birth ?? null),
      patient_gender: isWalkin ? null : (a.patient?.gender ?? null),
      doctor_name: a.doctor?.full_name ?? (a.assigned_doctor?.full_name ?? 'Unassigned'),
      doctor_id: a.doctor?.id ?? a.assigned_doctor_id ?? '',
      specialty_name: a.doctor?.specialty?.name ?? null,
    }
  })

  // Reuses apptRows (already fetched, already scoped by the same orFilter as the
  // counts below) rather than firing a separate query -- waiting_time_secs/
  // consult_duration_secs are already in that select.
  function avgMinutes(secs: number[]): number | null {
    if (secs.length === 0) return null
    return Math.round(secs.reduce((sum, v) => sum + v, 0) / secs.length / 60)
  }
  const avgWaitMinutes = avgMinutes(apptRows.map(a => a.waiting_time_secs).filter((v): v is number => v != null))
  const avgConsultMinutes = avgMinutes(apptRows.map(a => a.consult_duration_secs).filter((v): v is number => v != null))

  let stats = { total: 0, completed: 0, cancelled: 0, pending: 0, avgWaitMinutes, avgConsultMinutes }
  if (statsResult) {
    const [totalRes, completedRes, cancelledRes] = statsResult
    const total = totalRes.count ?? 0
    const completed = completedRes.count ?? 0
    const cancelled = cancelledRes.count ?? 0
    stats = { total, completed, cancelled, pending: total - completed - cancelled, avgWaitMinutes, avgConsultMinutes }
  }

  return NextResponse.json({
    clinic: clinic ? { ...clinic, is_emergency: (clinic as any).is_emergency ?? false } : null,
    doctors: ((clinicDoctors ?? []) as any[]).map(d => ({
      id: d.id, full_name: d.full_name, email: d.email ?? null, title: d.title,
      specialty_name: d.specialty?.name ?? null,
      avg_rating: d.avg_rating, review_count: d.review_count,
      is_active: d.is_active, accepts_virtual: d.accepts_virtual,
      consultation_fee: d.consultation_fee, years_experience: d.years_experience,
      clinic_id: d.clinic_id ?? null,
      is_active_here: d.clinic_id === clinicId,
      availability_status: d.availability_status ?? 'on_duty',
    })),
    staff: ((staffRows ?? []) as any[]).map(r => ({
      id: r.id, user_id: r.user_id,
      full_name: r.users?.full_name ?? 'Unknown',
      email: r.users?.email ?? '',
      role: r.role ?? 'clinic_admin',
      is_active: r.is_active,
      created_at: r.created_at,
    })),
    appointments,
    stats,
    clinicHours: { hours: fillHours(clinicHoursRows ?? []), isCustom: (clinicHoursRows ?? []).length > 0 },
    hospitalHours: fillHours(hospitalHoursRows ?? []),
  })
}

type PatchBody =
  | {
      action: 'update'; name?: string; description?: string | null; is_active?: boolean; service_tags?: string[]
      daily_booking_limit?: number | null; min_age?: number | null; max_age?: number | null
      gender_restriction?: 'male' | 'female' | null
    }
  | { action: 'toggle_active'; is_active: boolean }
  | { action: 'set_emergency' }
  | { action: 'clear_emergency' }
  | { action: 'update_hours'; hours: DayHours[] }
  | { action: 'clear_hours' }

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ clinicId: string }> }) {
  const res = await handlePATCH(req, ctx)
  for (const [k, v] of Object.entries(AUTH_CORS_HEADERS)) res.headers.set(k, v)
  return res
}

async function handlePATCH(req: NextRequest, { params }: { params: Promise<{ clinicId: string }> }) {
  const auth = await requireRole(['super_admin', 'hospital_admin', 'clinic_admin'], req)
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  const { clinicId } = await params
  const db = createAdminClient()

  const hospitalId = await assertOwnClinic(db, caller, clinicId)
  if (!hospitalId) return Errors.forbidden()

  const body = (await req.json()) as PatchBody

  switch (body.action) {
    case 'update': {
      // Whitelisted, not `const { action, ...updates } = body`. PatchBody is a
      // compile-time type over a raw req.json() cast, so it constrains nothing at
      // runtime: the spread previously forwarded whatever keys the client sent
      // straight into the UPDATE. That let a caller move the clinic to another
      // hospital by passing hospital_id, or set is_emergency directly and bypass
      // the "at most one Emergency Department" invariant that the set_emergency
      // branch below exists to maintain.
      const updates: Record<string, unknown> = {}
      if (typeof body.name === 'string' && body.name.trim()) updates.name = body.name.trim()
      if (body.description === null || typeof body.description === 'string') updates.description = body.description
      if (typeof body.is_active === 'boolean') updates.is_active = body.is_active
      if (Array.isArray(body.service_tags) && body.service_tags.every(t => typeof t === 'string')) {
        updates.service_tags = body.service_tags
      }
      if (body.daily_booking_limit === null) {
        updates.daily_booking_limit = null
      } else if (body.daily_booking_limit !== undefined) {
        // parseInt on the client turns "abc" into NaN, which JSON-serializes to
        // null (silently "unlimited"); a negative value would mark every day full.
        const n = body.daily_booking_limit
        if (!Number.isInteger(n) || n < 0) return Errors.validation('daily_booking_limit must be a non-negative integer')
        updates.daily_booking_limit = n
      }

      // Age/gender booking eligibility -- same null-means-unrestricted shape as
      // daily_booking_limit. The actual enforcement is a DB trigger
      // (enforce_clinic_booking_eligibility, 20260826000001) since most booking
      // paths are raw client-side inserts this API never sees; this validation
      // just keeps obviously-bad config (negative age, min > max) out of the table.
      for (const field of ['min_age', 'max_age'] as const) {
        const n = body[field]
        if (n === null) {
          updates[field] = null
        } else if (n !== undefined) {
          if (!Number.isInteger(n) || n < 0) return Errors.validation(`${field} must be a non-negative integer`)
          updates[field] = n
        }
      }
      const effectiveMin = 'min_age' in updates ? (updates.min_age as number | null) : undefined
      const effectiveMax = 'max_age' in updates ? (updates.max_age as number | null) : undefined
      if (effectiveMin != null && effectiveMax != null && effectiveMin > effectiveMax) {
        return Errors.validation('min_age must not be greater than max_age')
      }
      if (body.gender_restriction === null) {
        updates.gender_restriction = null
      } else if (body.gender_restriction !== undefined) {
        if (!['male', 'female'].includes(body.gender_restriction)) {
          return Errors.validation("gender_restriction must be 'male', 'female', or null")
        }
        updates.gender_restriction = body.gender_restriction
      }

      if (Object.keys(updates).length === 0) return Errors.validation('No valid fields to update')

      const { error } = await db.from('hospital_clinics').update(updates as any).eq('id', clinicId)
      if (error) return Errors.internal(error.message)
      return NextResponse.json({ success: true })
    }
    case 'toggle_active': {
      await db.from('hospital_clinics').update({ is_active: body.is_active }).eq('id', clinicId)
      return NextResponse.json({ success: true })
    }
    case 'set_emergency': {
      // A hospital has at most one Emergency Department clinic -- clear whichever
      // clinic previously held the flag so the two updates can't both land "true".
      const { error: clearErr } = await db.from('hospital_clinics')
        .update({ is_emergency: false } as any).eq('hospital_id', hospitalId).eq('is_emergency', true)
      if (clearErr) return Errors.internal(clearErr.message)
      const { error } = await db.from('hospital_clinics').update({ is_emergency: true } as any).eq('id', clinicId)
      if (error) return Errors.internal(error.message)
      return NextResponse.json({ success: true })
    }
    case 'clear_emergency': {
      const { error } = await db.from('hospital_clinics').update({ is_emergency: false } as any).eq('id', clinicId)
      if (error) return Errors.internal(error.message)
      return NextResponse.json({ success: true })
    }
    case 'update_hours': {
      // Same rationale as 'update': body.hours is unvalidated at runtime, and a
      // day_of_week outside 0-6 inserts rows that fillHours can never read back.
      const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
      if (!Array.isArray(body.hours) || body.hours.length > 7) {
        return Errors.validation('hours must be an array of at most 7 days')
      }
      const valid = body.hours.every(h =>
        h && Number.isInteger(h.day) && h.day >= 0 && h.day <= 6 &&
        typeof h.open === 'string' && HHMM.test(h.open) &&
        typeof h.close === 'string' && HHMM.test(h.close) &&
        typeof h.closed === 'boolean',
      )
      if (!valid) return Errors.validation('Each day needs day 0-6, HH:MM open/close, and a closed flag')

      const rows = body.hours.map(h => ({
        clinic_id: clinicId, day_of_week: h.day, open_time: h.open, close_time: h.close, is_closed: h.closed,
      }))
      const { error } = await db.from('hospital_clinic_hours').upsert(rows, { onConflict: 'clinic_id,day_of_week' })
      if (error) return Errors.internal(error.message)
      return NextResponse.json({ success: true })
    }
    case 'clear_hours': {
      const { error } = await db.from('hospital_clinic_hours').delete().eq('clinic_id', clinicId)
      if (error) return Errors.internal(error.message)
      return NextResponse.json({ success: true })
    }
    default:
      return Errors.validation('Unknown action')
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ clinicId: string }> }) {
  const res = await handleDELETE(req, ctx)
  for (const [k, v] of Object.entries(AUTH_CORS_HEADERS)) res.headers.set(k, v)
  return res
}

async function handleDELETE(req: NextRequest, { params }: { params: Promise<{ clinicId: string }> }) {
  const auth = await requireRole(['super_admin', 'hospital_admin'], req)
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  const { clinicId } = await params
  const db = createAdminClient()

  const hospitalId = await assertOwnClinic(db, caller, clinicId)
  if (!hospitalId) return Errors.forbidden()

  const { error } = await db.from('hospital_clinics').delete().eq('id', clinicId)
  if (error) return Errors.internal(error.message)
  return NextResponse.json({ success: true })
}
