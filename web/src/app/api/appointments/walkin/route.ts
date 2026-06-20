import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'

// POST — front desk creates a walk-in appointment
// Body: { hospitalId, patientName, patientPhone?, doctorId?, clinicId?, date, startTime, reason, staffId? }
export async function POST(req: NextRequest) {
  const db = createAdminClient()
  try {
    const body = await req.json()
    const {
      hospitalId, patientName, patientPhone, doctorId, clinicId,
      date, startTime, reason, staffId,
    } = body

    if (!hospitalId || !patientName || !date || !startTime) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Look up or create a patient user record by phone number
    let patientUserId: string | null = null

    if (patientPhone) {
      // Try to find existing user by phone
      const { data: existing } = await db
        .from('users')
        .select('id')
        .eq('phone', patientPhone)
        .limit(1)
        .single()

      if (existing) {
        patientUserId = existing.id
      } else {
        // Create a minimal user record for the walk-in patient
        const { data: authUser } = await db.auth.admin.createUser({
          phone: patientPhone,
          phone_confirm: true,
          user_metadata: { full_name: patientName },
        })
        if (authUser?.user) {
          const { data: newUser } = await db
            .from('users')
            .insert({ auth_id: authUser.user.id, full_name: patientName, phone: patientPhone })
            .select('id')
            .single()
          patientUserId = newUser?.id ?? null
        }
      }
    }

    const bookingRef = `WLK-${Date.now().toString().slice(-6)}`

    const { data, error } = await db
      .from('appointments')
      .insert({
        hospital_id:          hospitalId,
        patient_id:           patientUserId,
        doctor_id:            doctorId ?? null,
        clinic_id:            clinicId ?? null,
        appointment_date:     date,
        start_time:           startTime,
        type:                 'in-person',
        reason:               reason ?? null,
        status:               'confirmed',
        booking_mode:         'walkin',
        approval_status:      'auto_approved',
        urgency:              'routine',
        booking_ref:          bookingRef,
        booked_by_staff_id:   staffId ?? null,
        walkin_patient_name:  patientName,
        walkin_patient_phone: patientPhone ?? null,
        refund_pct:           0,
      })
      .select('id, booking_ref')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ id: data.id, bookingRef: data.booking_ref })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
