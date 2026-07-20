import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/supabase/auth-server'
import { Errors } from '@/lib/api-error'

// GET — look up a registered patient by patient_number or phone.
// super_admin excluded: patient contact details are PHI and super_admin
// has no operational need to query individual patients.
export async function GET(req: NextRequest) {
  const auth = await requireRole(['hospital_admin', 'clinic_admin', 'front_desk'])
  if (auth instanceof NextResponse) return auth
  const db = createAdminClient()
  const { searchParams } = new URL(req.url)
  const patientNumber = searchParams.get('patientNumber')?.trim().toUpperCase()
  const phone         = searchParams.get('phone')?.trim()

  if (!patientNumber && !phone) {
    return NextResponse.json({ error: 'patientNumber or phone required' }, { status: 400 })
  }

  let query = (db.from('users') as any).select('id, full_name, phone, patient_number, email')

  if (patientNumber) {
    query = query.eq('patient_number', patientNumber)
  } else {
    query = query.eq('phone', phone!)
  }

  const { data } = await query.limit(1).single()
  if (!data) return NextResponse.json({ found: false })

  return NextResponse.json({
    found: true,
    patient: {
      id:             data.id,
      full_name:      data.full_name,
      phone:          data.phone,
      patient_number: data.patient_number,
      email:          data.email,
    },
  })
}

// POST — front desk creates a walk-in appointment.
// super_admin excluded: walk-in intake creates patient records (PHI).
export async function POST(req: NextRequest) {
  const auth = await requireRole(['hospital_admin', 'clinic_admin', 'front_desk'])
  if (auth instanceof NextResponse) return auth
  const db = createAdminClient()
  try {
    const body = await req.json()
    const {
      hospitalId, patientName, patientPhone, patientNumber,
      doctorId, clinicId, date, startTime, reason, staffId,
    } = body

    if (!hospitalId || !patientName || !date || !startTime) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // ── Plan: monthly booking cap (belt-and-suspenders above DB trigger) ───────
    const { data: sub } = await db
      .from('hospital_subscriptions')
      .select('subscription_plans(max_monthly_bookings)')
      .eq('hospital_id', hospitalId)
      .eq('status', 'active')
      .single() as { data: { subscription_plans: { max_monthly_bookings: number | null } | null } | null; error: unknown }

    const maxMonthly: number | null = (sub?.subscription_plans as any)?.max_monthly_bookings ?? null
    if (maxMonthly !== null) {
      const monthStart = new Date()
      monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0)
      const { count } = await db.from('appointments')
        .select('*', { count: 'exact', head: true })
        .eq('hospital_id', hospitalId)
        .gte('created_at', monthStart.toISOString())
        .neq('status', 'cancelled')
      if ((count ?? 0) >= maxMonthly) return Errors.planLimitMonthly(maxMonthly)
    }

    // Try to link to a registered patient — look up by patient_number first, then phone
    let patientUserId: string | null = null

    if (patientNumber?.trim()) {
      const { data } = await (db.from('users') as any)
        .select('id')
        .eq('patient_number', patientNumber.trim().toUpperCase())
        .limit(1)
        .single()
      if (data) patientUserId = data.id
    }

    if (!patientUserId && patientPhone?.trim()) {
      const { data } = await db
        .from('users')
        .select('id')
        .eq('phone', patientPhone.trim())
        .limit(1)
        .single()
      if (data) patientUserId = data.id
    }

    const bookingRef = `WLK-${Date.now().toString().slice(-6)}`

    const { data, error } = await db
      .from('appointments')
      .insert({
        hospital_id:          hospitalId,
        patient_id:           patientUserId,
        doctor_id:            doctorId   ?? null,
        clinic_id:            clinicId   ?? null,
        appointment_date:     date,
        start_time:           startTime,
        type:                 'in-person',
        reason:               reason     ?? null,
        status:               'confirmed',
        booking_mode:         'walkin',
        approval_status:      'auto_approved',
        urgency:              'routine',
        booking_ref:          bookingRef,
        booked_by_staff_id:   staffId    ?? null,
        walkin_patient_name:  patientName,
        walkin_patient_phone: patientPhone ?? null,
        refund_pct:           0,
      } as any)
      .select('id, booking_ref')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({
      id:         data.id,
      bookingRef: data.booking_ref,
      linked:     !!patientUserId,
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
