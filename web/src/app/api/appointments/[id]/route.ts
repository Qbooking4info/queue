import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/supabase/auth-server'
import { Errors } from '@/lib/api-error'
import { todayLocalDate } from '@/lib/dashboard-utils'
import { notifyPatient } from '@/lib/notify-patient'

type Action =
  | { action: 'assign_doctor'; doctorId: string }
  | { action: 'mark_no_show' }
  | { action: 'approve'; note?: string }
  | { action: 'reject'; note: string }
  | { action: 'check_in' }
  | { action: 'start_consultation' }
  | { action: 'end_consultation' }
  | { action: 'set_status'; status: string }

async function getDoctorAvgConsultDuration(db: ReturnType<typeof createAdminClient>, doctorId: string): Promise<number | null> {
  const { data } = await (db as any)
    .from('appointments')
    .select('consult_duration_secs')
    .eq('doctor_id', doctorId)
    .not('consult_duration_secs', 'is', null)
  if (!data || data.length === 0) return null
  const total = (data as { consult_duration_secs: number }[]).reduce((sum: number, r) => sum + r.consult_duration_secs, 0)
  return total / data.length
}

// Shared by check_in (when a doctor is already known, e.g. doctor-mode bookings) and
// assign_doctor (when a hospital-mode booking gets its doctor assigned after check-in,
// once staff actually know who's on duty) -- queue scope is "checked in today," not the
// originally booked appointment_date, so a future-dated booking that walks in today
// joins today's physical queue, per doctor.
async function computeQueuePosition(
  db: ReturnType<typeof createAdminClient>, hospitalId: string, checkInDate: string,
  doctorId: string, isEmergency: boolean, excludeApptId: string,
): Promise<{ queuePosition: number; estimatedWait: number | null }> {
  const [byDoctor, byAssigned] = await Promise.all([
    (db as any).from('appointments').select('id, queue_position')
      .eq('hospital_id', hospitalId).eq('check_in_date', checkInDate)
      .in('status', ['checked_in', 'in_progress']).eq('doctor_id', doctorId).neq('id', excludeApptId),
    (db as any).from('appointments').select('id, queue_position')
      .eq('hospital_id', hospitalId).eq('check_in_date', checkInDate)
      .in('status', ['checked_in', 'in_progress']).eq('assigned_doctor_id', doctorId).neq('id', excludeApptId),
  ])
  const others = [...(byDoctor.data ?? []), ...(byAssigned.data ?? [])] as { id: string; queue_position: number | null }[]
  const ahead = others.length

  if (isEmergency) {
    // Emergency jumps straight to the front -- shift everyone already in this
    // doctor's queue today back by one instead of just appending to the end.
    await Promise.all(others.map(o =>
      (db as any).from('appointments').update({ queue_position: (o.queue_position ?? ahead) + 1 }).eq('id', o.id)
    ))
    return { queuePosition: 1, estimatedWait: 0 }
  }
  const avgSecs = await getDoctorAvgConsultDuration(db, doctorId)
  return { queuePosition: ahead + 1, estimatedWait: avgSecs != null ? Math.round((ahead * avgSecs) / 60) : null }
}

// PATCH /api/appointments/[id] -- Task 15, replacing admin-api.ts's
// assignDoctorToAppointment/markNoShow/approveAppointment/rejectAppointment/
// checkInAppointment/startConsultation/endConsultation, none of which had
// any caller ownership check at all (adminDb, reachable from the browser).
// Every action here is scoped to the caller's own hospital first.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(['super_admin', 'hospital_admin', 'clinic_admin', 'front_desk', 'doctor'], req)
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  const { id } = await params
  const db = createAdminClient()

  const { data: appt, error: apptErr } = await (db as any)
    .from('appointments')
    .select('hospital_id, doctor_id, assigned_doctor_id, urgency, clinic_id, status, check_in_date')
    .eq('id', id)
    .single()
  if (apptErr || !appt) return Errors.notFound('Appointment')
  if (caller.role !== 'super_admin' && caller.hospitalId !== appt.hospital_id) {
    return Errors.forbidden("Cannot modify another hospital's appointment")
  }

  const body = (await req.json()) as Action

  switch (body.action) {
    case 'assign_doctor': {
      const { data: doctor, error: docErr } = await (db as any)
        .from('doctors').select('hospital_id, clinic_id, is_active, availability_status').eq('id', body.doctorId).single()
      if (docErr || !doctor) return Errors.notFound('Doctor')

      // Assignment can only happen at check-in -- that's the first point staff actually
      // know who's on duty right now. Assigning earlier (while still pending/confirmed)
      // can't reflect real-time availability, and queue_position is computed per-doctor
      // right here, so doing it before check-in would leave a stale slot regardless.
      if (appt.status !== 'checked_in') {
        return Errors.validation('Doctor can only be assigned at check-in')
      }
      if (doctor.hospital_id !== appt.hospital_id) return Errors.validation('Doctor does not belong to this hospital')
      if (appt.clinic_id && doctor.clinic_id !== appt.clinic_id) {
        return Errors.validation("Doctor is not registered to this appointment's clinic")
      }
      if (!doctor.is_active) return Errors.validation('Doctor is not active')
      if (doctor.availability_status && doctor.availability_status !== 'on_duty') {
        return Errors.validation('Doctor is on break or off duty and cannot be assigned patients')
      }

      const checkInDate = appt.check_in_date ?? todayLocalDate()
      const isEmergency = appt.urgency === 'emergency'
      const { queuePosition, estimatedWait } = await computeQueuePosition(db, appt.hospital_id, checkInDate, body.doctorId, isEmergency, id)

      const { error } = await db.from('appointments').update({
        assigned_doctor_id: body.doctorId,
        doctor_id: body.doctorId,
        queue_position: queuePosition,
        estimated_wait: estimatedWait,
        updated_at: new Date().toISOString(),
      } as any).eq('id', id).eq('status', 'checked_in')
      if (error) return Errors.internal(error.message)
      return NextResponse.json({ success: true })
    }

    case 'mark_no_show': {
      const now = new Date().toISOString()
      const deadline = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
      // BM2: only pending/confirmed/checked_in can be marked no-show; in_progress has already started.
      await (db as any).from('appointments').update({
        status: 'no_show', no_show_at: now, reschedule_deadline: deadline, updated_at: now,
      }).eq('id', id).in('status', ['pending', 'confirmed', 'checked_in'])
      return NextResponse.json({ success: true })
    }

    case 'approve': {
      const { data: full } = await db
        .from('appointments')
        .select('booking_ref, appointment_date, hospital:hospitals!appointments_hospital_id_fkey(name), clinic:hospital_clinics!appointments_clinic_id_fkey(name)')
        .eq('id', id)
        .single()

      // BH1: manual admin approval should use 'approved', not 'auto_approved'
      // BH2: guard against re-approving already-decided or closed appointments
      await (db as any).from('appointments').update({
        approval_status: 'approved', status: 'confirmed', approval_note: body.note ?? null, updated_at: new Date().toISOString(),
      }).eq('id', id).eq('approval_status', 'pending_approval').not('status', 'in', '("cancelled","completed")')

      const hospitalName = (full as any)?.hospital?.name ?? 'the hospital'
      const clinicName = (full as any)?.clinic?.name
      const ref = (full as any)?.booking_ref ?? id
      const dateStr = (full as any)?.appointment_date
        ? new Date((full as any).appointment_date + 'T12:00:00').toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short' })
        : ''
      const notifBody = clinicName
        ? `Your booking (${ref}) at ${hospitalName} — ${clinicName} on ${dateStr} has been confirmed.`
        : `Your booking (${ref}) at ${hospitalName} on ${dateStr} has been confirmed.`
      await notifyPatient(db, id, 'confirmed', 'Booking Approved', notifBody)
      return NextResponse.json({ success: true })
    }

    case 'reject': {
      if (!body.note?.trim()) return Errors.validation('A rejection note is required')
      const { data: full } = await db
        .from('appointments')
        .select('booking_ref, hospital:hospitals!appointments_hospital_id_fkey(name)')
        .eq('id', id)
        .single()

      // BH2: guard against re-rejecting already-decided or closed appointments
      await (db as any).from('appointments').update({
        approval_status: 'rejected', status: 'cancelled', approval_note: body.note,
        cancellation_reason: `Booking rejected: ${body.note}`, cancelled_at: new Date().toISOString(),
        refund_pct: 100, updated_at: new Date().toISOString(),
      }).eq('id', id).eq('approval_status', 'pending_approval').not('status', 'in', '("cancelled","completed")')

      const ref = (full as any)?.booking_ref ?? id
      const hospitalName = (full as any)?.hospital?.name ?? 'the hospital'
      await notifyPatient(
        db, id, 'cancelled', 'Booking Not Approved',
        `Your booking (${ref}) at ${hospitalName} was not approved. Reason: ${body.note}. A full refund has been issued.`,
      )
      return NextResponse.json({ success: true })
    }

    case 'check_in': {
      const checkInDate = todayLocalDate()
      const doctorId = appt.doctor_id ?? appt.assigned_doctor_id
      const isEmergency = appt.urgency === 'emergency'
      let queuePosition: number | null = null
      let estimatedWait: number | null = null

      // Only doctor-mode bookings (patient picked a specific doctor) already have one at
      // check-in -- hospital-mode/OPD bookings check in with no doctor and no queue
      // position at all until staff assign one (see assign_doctor), since that's now the
      // only point a doctor's real-time on-duty status is known.
      if (doctorId) {
        ({ queuePosition, estimatedWait } = await computeQueuePosition(db, appt.hospital_id, checkInDate, doctorId, isEmergency, id))
      }

      // BH6: enforce SOP -- only 'confirmed' appointments may be checked in
      const { error } = await (db as any).from('appointments').update({
        status: 'checked_in', check_in_date: checkInDate,
        queue_position: queuePosition, estimated_wait: estimatedWait, updated_at: new Date().toISOString(),
      }).eq('id', id).in('status', ['confirmed'])
      if (error) return Errors.internal(error.message)
      return NextResponse.json({ success: true })
    }

    case 'start_consultation': {
      const doctorId = appt.doctor_id ?? appt.assigned_doctor_id
      const checkInDate = todayLocalDate()

      // Auto-end whatever this doctor was previously seeing, if it was never explicitly ended.
      if (doctorId) {
        const [byDoctor, byAssigned] = await Promise.all([
          (db as any).from('appointments').select('id')
            .eq('hospital_id', appt.hospital_id).eq('check_in_date', checkInDate)
            .eq('status', 'in_progress').eq('doctor_id', doctorId).neq('id', id),
          (db as any).from('appointments').select('id')
            .eq('hospital_id', appt.hospital_id).eq('check_in_date', checkInDate)
            .eq('status', 'in_progress').eq('assigned_doctor_id', doctorId).neq('id', id),
        ])
        const staleIds = Array.from(new Set([
          ...((byDoctor.data ?? []) as { id: string }[]).map(r => r.id),
          ...((byAssigned.data ?? []) as { id: string }[]).map(r => r.id),
        ]))
        if (staleIds.length > 0) {
          const { error: autoEndErr } = await (db as any).from('appointments')
            .update({ status: 'completed', consult_ended_at: new Date().toISOString() })
            .in('id', staleIds)
          if (autoEndErr) return Errors.internal(`Failed to auto-end previous consult: ${autoEndErr.message}`)

          // BM3: end any orphaned virtual sessions for auto-completed appointments
          await (db as any).from('virtual_sessions')
            .update({ status: 'ended', ended_at: new Date().toISOString() })
            .in('appointment_id', staleIds).eq('status', 'active')
        }
      }

      // BH5: enforce state machine -- only 'checked_in' or 'confirmed' may start a consultation
      const { error } = await (db as any).from('appointments').update({
        status: 'in_progress', consult_started_at: new Date().toISOString(),
      }).eq('id', id).in('status', ['checked_in', 'confirmed'])
      if (error) return Errors.internal(error.message)
      return NextResponse.json({ success: true })
    }

    case 'end_consultation': {
      // BH5: enforce state machine -- only 'in_progress' may be ended
      const { error } = await (db as any).from('appointments').update({
        status: 'completed', consult_ended_at: new Date().toISOString(),
      }).eq('id', id).eq('status', 'in_progress')
      if (error) return Errors.internal(error.message)

      // BM4: end the virtual session (if any) now that the appointment is completed
      await (db as any).from('virtual_sessions')
        .update({ status: 'ended', ended_at: new Date().toISOString() })
        .eq('appointment_id', id).eq('status', 'active')
      return NextResponse.json({ success: true })
    }

    case 'set_status': {
      // Bare status flip, no transition guard -- matches admin-api.ts's
      // updateAppointmentStatus exactly (used by clinics/[clinicId]/page.tsx
      // for its own check-in/complete buttons, which historically bypassed
      // the queue-position logic the main queue/appointments pages use).
      // Preserved as-is rather than silently rerouting it through
      // check_in/end_consultation's extra logic, which would change
      // behavior beyond adding the authorization check this task is about.
      const { error } = await (db as any).from('appointments')
        .update({ status: body.status, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) return Errors.internal(error.message)
      return NextResponse.json({ success: true })
    }

    default:
      return Errors.validation('Unknown action')
  }
}
