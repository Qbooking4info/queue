import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/supabase/auth-server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Errors } from '@/lib/api-error'
import { clinicOrFilter, ageFrom } from '@/lib/hospital-scope'

/**
 * GET /api/patients?q=
 *
 * The hospital's patients: everyone with at least one appointment here (or at
 * the caller's clinic), one row each, with visit count, last and next visit.
 * `q` matches name, phone or patient number. Walk-ins without an account have
 * no users row and are not listed. Shared by web and Queue Hospital.
 */
type Appt = {
  appointment_date: string; status: string; patient_id: string
  patient: { id: string; full_name: string | null; phone: string | null; gender: string | null; date_of_birth: string | null; patient_code: string | null; patient_number: string | null } | null
}

export async function GET(req: NextRequest) {
  const auth = await requireRole(['super_admin', 'hospital_admin', 'clinic_admin', 'front_desk'], req)
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  if (!caller.hospitalId) return Errors.forbidden()

  const db = createAdminClient()
  const orFilter = await clinicOrFilter(db, caller)

  const rows: Appt[] = []
  for (let off = 0; ; off += 1000) {
    let q = db.from('appointments')
      .select('appointment_date, status, patient_id, patient:users!appointments_patient_id_fkey(id, full_name, phone, gender, date_of_birth, patient_code, patient_number)')
      .eq('hospital_id', caller.hospitalId).not('patient_id', 'is', null)
      .order('appointment_date', { ascending: false })
    if (orFilter) q = q.or(orFilter)
    const { data, error } = await q.range(off, off + 999)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    rows.push(...((data ?? []) as unknown as Appt[]))
    if (!data || data.length < 1000 || rows.length >= 20000) break
  }

  const today = new Date().toISOString().slice(0, 10)
  const byPatient = new Map<string, { id: string; name: string; phone: string | null; gender: string | null; age: number | null
    patientNumber: string | null; visits: number; lastVisit: string | null; nextVisit: string | null; noShows: number }>()
  for (const a of rows) {
    if (!a.patient) continue
    let p = byPatient.get(a.patient_id)
    if (!p) {
      p = { id: a.patient.id, name: a.patient.full_name?.trim() || 'Unnamed patient', phone: a.patient.phone, gender: a.patient.gender,
        age: ageFrom(a.patient.date_of_birth), patientNumber: a.patient.patient_number ?? a.patient.patient_code,
        visits: 0, lastVisit: null, nextVisit: null, noShows: 0 }
      byPatient.set(a.patient_id, p)
    }
    if (a.status === 'cancelled') continue
    if (a.status === 'no_show') p.noShows++
    if (a.appointment_date <= today && a.status === 'completed') {
      p.visits++
      if (!p.lastVisit || a.appointment_date > p.lastVisit) p.lastVisit = a.appointment_date
    }
    if (a.appointment_date >= today && ['pending', 'confirmed', 'checked_in'].includes(a.status)) {
      if (!p.nextVisit || a.appointment_date < p.nextVisit) p.nextVisit = a.appointment_date
    }
  }

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim().toLowerCase()
  let patients = [...byPatient.values()]
  if (q) patients = patients.filter(p => p.name.toLowerCase().includes(q)
    || (p.phone ?? '').replace(/\s/g, '').includes(q.replace(/\s/g, ''))
    || (p.patientNumber ?? '').toLowerCase().includes(q))
  patients.sort((a, b) => (b.lastVisit ?? b.nextVisit ?? '').localeCompare(a.lastVisit ?? a.nextVisit ?? ''))

  return NextResponse.json({ patients: patients.slice(0, 500), total: patients.length })
}
