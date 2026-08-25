import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/supabase/auth-server'
import { Errors } from '@/lib/api-error'
import { todayLocalDate } from '@/lib/dashboard-utils'
import { notifyPatient } from '@/lib/notify-patient'
import { checkInAppointment } from '@/lib/appointment-checkin'
import { AUTH_CORS_HEADERS, corsOptions } from '@/lib/cors'

// The appointment state machine, as implemented across the queue, front-desk and
// dashboard flows. appointments.status has no database CHECK, so this is the only
// thing standing between a typo and an unreachable row.
const APPOINTMENT_STATUSES = [
  'pending', 'confirmed', 'checked_in', 'in_progress', 'completed', 'cancelled', 'no_show',
] as const

type Action =
  | { action: 'assign_doctor'; doctorId: string }
  | { action: 'mark_no_show' }
  | { action: 'approve'; note?: string }
  | { action: 'reject'; note: string }
  | { action: 'check_in' }
  | { action: 'start_consultation' }
  | { action: 'end_consultation' }
  | { action: 'set_status'; status: string }
  | { action: 'update_consult_notes'; notes?: string | null; diagnosis?: string | null }
  | { action: 'ring' }

// PATCH /api/appointments/[id] -- Task 15, replacing admin-api.ts's
// assignDoctorToAppointment/markNoShow/approveAppointment/rejectAppointment/
// checkInAppointment/startConsultation/endConsultation, none of which had
// any caller ownership check at all (adminDb, reachable from the browser).
// Every action here is scoped to the caller's own hospital first.
//
// Called cross-origin by the doctors/mobile apps (e.g. localhost:8095 ->
// localhost:3000) for start_consultation/end_consultation/update_consult_notes
// -- needs real CORS handling (preflight OPTIONS + headers on every response),
// not just the Allow-Origin-only pattern used by unauthenticated public routes.
export async function OPTIONS() {
  return corsOptions()
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const res = await handlePATCH(req, ctx)
  for (const [k, v] of Object.entries(AUTH_CORS_HEADERS)) res.headers.set(k, v)
  return res
}

async function handlePATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(['super_admin', 'hospital_admin', 'clinic_admin', 'front_desk', 'doctor'], req)
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  const { id } = await params
  const db = createAdminClient()

  const { data: appt, error: apptErr } = await db
    .from('appointments')
    .select('hospital_id, doctor_id, assigned_doctor_id, urgency, clinic_id, status, check_in_date')
    .eq('id', id)
    .single()
  if (apptErr || !appt) return Errors.notFound('Appointment')
  // Direct (hospital-less) bookings never come through here -- they go through
  // PATCH /api/appointments/direct/[id], scoped by doctor_user_id instead of
  // hospital_id (see 20260817000001_direct_doctor_booking.sql). Guarding this
  // early also lets TS narrow appt.hospital_id to `string` below.
  if (appt.hospital_id === null) return Errors.notFound('Appointment')
  if (caller.role !== 'super_admin' && caller.hospitalId !== appt.hospital_id) {
    return Errors.forbidden("Cannot modify another hospital's appointment")
  }

  const body = (await req.json()) as Action

  switch (body.action) {
    case 'assign_doctor': {
      const { data: doctor, error: docErr } = await (db as any)
        .from('doctors').select('hospital_id, clinic_id, is_active, availability_status, user_id').eq('id', body.doctorId).single()
      if (docErr || !doctor) return Errors.notFound('Doctor')

      // Assignment can only happen at check-in -- that's the first point staff actually
      // know who's on duty right now. Assigning earlier (while still pending/confirmed)
      // can't reflect real-time availability.
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

      // A doctor linked to multiple hospitals can only have ONE active at a
      // time (users.active_hospital_id, set via the doctors app's hospital
      // switcher) -- staff at a hospital that isn't currently active for this
      // doctor must not be able to assign them patients there, even though
      // the doctors row itself is still is_active=true. No active_hospital_id
      // set at all falls back to the doctor's earliest-linked hospital, same
      // default used everywhere else this ambiguity is resolved (auth-server.ts,
      // AuthContext) -- a doctor who never touched the switcher isn't
      // penalised at their one and only (or first) hospital.
      if (doctor.user_id) {
        const { data: userRow } = await db.from('users').select('active_hospital_id').eq('id', doctor.user_id).single()
        const activeHospitalId = (userRow as any)?.active_hospital_id ?? null
        let effectiveActive = activeHospitalId
        if (!effectiveActive) {
          const { data: earliest } = await db.from('doctors')
            .select('hospital_id')
            .eq('user_id', doctor.user_id)
            .eq('is_active', true)
            .order('created_at', { ascending: true })
            .limit(1)
            .single()
          effectiveActive = (earliest as any)?.hospital_id ?? null
        }
        if (effectiveActive && effectiveActive !== appt.hospital_id) {
          return Errors.validation('Doctor is not currently active at this hospital and cannot be assigned patients here')
        }
      }

      // queue_position/estimated_wait aren't set here -- assigning doctor_id triggers
      // renumber_queue_after_change (supabase/migrations/20260805000001_atomic_queue_renumbering.sql),
      // which atomically recomputes this doctor's whole queue off checked_in_at.
      // queue_rank_override is cleared too -- a manual reorder rank was only ever
      // meaningful relative to the PREVIOUS doctor's cohort; carrying it over would
      // land this patient at an arbitrary spot in the new doctor's queue instead of
      // fresh FIFO (supabase/migrations/20260821000003_queue_manual_reorder_and_alerts.sql).
      const { data: updated, error } = await db.from('appointments').update({
        assigned_doctor_id: body.doctorId,
        doctor_id: body.doctorId,
        queue_rank_override: null,
        updated_at: new Date().toISOString(),
      } as any).eq('id', id).eq('status', 'checked_in').select('id')
      if (error) return Errors.internal(error.message)
      if (!updated?.length) return Errors.validation('Appointment is no longer checked in')
      return NextResponse.json({ success: true })
    }

    case 'mark_no_show': {
      const now = new Date().toISOString()
      const deadline = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
      // BM2: only pending/confirmed/checked_in can be marked no-show; in_progress has already started.
      const { data: updated } = await db.from('appointments').update({
        status: 'no_show', no_show_at: now, reschedule_deadline: deadline, updated_at: now,
      }).eq('id', id).in('status', ['pending', 'confirmed', 'checked_in']).select('id')
      if (!updated?.length) {
        return Errors.validation(`Cannot mark an appointment that is ${appt.status} as a no-show`)
      }
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
      const { data: updated } = await db.from('appointments').update({
        approval_status: 'approved', status: 'confirmed', approval_note: body.note ?? null, updated_at: new Date().toISOString(),
      }).eq('id', id).eq('approval_status', 'pending_approval').not('status', 'in', '("cancelled","completed")').select('id')

      // The guard above is silent on a no-op, so without this check a second
      // approval of an already-decided booking still fell through to
      // notifyPatient and sent the patient a duplicate "Booking Approved".
      if (!updated?.length) return Errors.validation('This booking is no longer awaiting approval')

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
      const { data: updated } = await db.from('appointments').update({
        approval_status: 'rejected', status: 'cancelled', approval_note: body.note,
        cancellation_reason: `Booking rejected: ${body.note}`, cancelled_at: new Date().toISOString(),
        refund_pct: 100, updated_at: new Date().toISOString(),
      }).eq('id', id).eq('approval_status', 'pending_approval').not('status', 'in', '("cancelled","completed")').select('id')

      // Same silent-no-op problem as approve: without this, re-rejecting told
      // the patient again that they were declined and refunded.
      if (!updated?.length) return Errors.validation('This booking is no longer awaiting approval')

      const ref = (full as any)?.booking_ref ?? id
      const hospitalName = (full as any)?.hospital?.name ?? 'the hospital'
      await notifyPatient(
        db, id, 'cancelled', 'Booking Not Approved',
        `Your booking (${ref}) at ${hospitalName} was not approved. Reason: ${body.note}. No payment was taken for this booking.`,
      )
      return NextResponse.json({ success: true })
    }

    case 'check_in': {
      const result = await checkInAppointment(db, id)
      if (!result.ok) return Errors.validation(result.error)
      return NextResponse.json({ success: true })
    }

    case 'start_consultation': {
      const doctorId = appt.doctor_id ?? appt.assigned_doctor_id
      const checkInDate = todayLocalDate()

      // Auto-end whatever this doctor was previously seeing, if it was never explicitly ended.
      if (doctorId) {
        const [byDoctor, byAssigned] = await Promise.all([
          db.from('appointments').select('id')
            .eq('hospital_id', appt.hospital_id).eq('check_in_date', checkInDate)
            .eq('status', 'in_progress').eq('doctor_id', doctorId).neq('id', id),
          db.from('appointments').select('id')
            .eq('hospital_id', appt.hospital_id).eq('check_in_date', checkInDate)
            .eq('status', 'in_progress').eq('assigned_doctor_id', doctorId).neq('id', id),
        ])
        const staleIds = Array.from(new Set([
          ...((byDoctor.data ?? []) as { id: string }[]).map(r => r.id),
          ...((byAssigned.data ?? []) as { id: string }[]).map(r => r.id),
        ]))
        if (staleIds.length > 0) {
          const { error: autoEndErr } = await db.from('appointments')
            .update({ status: 'completed', consult_ended_at: new Date().toISOString() })
            .in('id', staleIds)
          if (autoEndErr) return Errors.internal(`Failed to auto-end previous consult: ${autoEndErr.message}`)

          // BM3: end any orphaned virtual sessions for auto-completed appointments
          await db.from('virtual_sessions')
            .update({ status: 'ended', ended_at: new Date().toISOString() })
            .in('appointment_id', staleIds).eq('status', 'active')
        }
      }

      // BH5: enforce state machine -- only 'checked_in' or 'confirmed' may start a consultation
      const { data: updated, error } = await db.from('appointments').update({
        status: 'in_progress', consult_started_at: new Date().toISOString(),
      }).eq('id', id).in('status', ['checked_in', 'confirmed']).select('id')
      if (error) return Errors.internal(error.message)
      if (!updated?.length) return Errors.validation(`Cannot start a consultation from status ${appt.status}`)

      // "Get ready" pre-alert: whoever is now at queue_position 2 for this doctor+day
      // is about to be next, while the patient ahead of them is still being seen --
      // this is the moment to give them a heads-up, not when they're actually called.
      // next_up_alert_sent_at is a one-time claim guard (same UPDATE...WHERE...select
      // pattern as approve/reject above) so this doesn't re-fire on every later queue
      // touch (another check-in, a completion elsewhere, etc.) while they're still at
      // position 2. Best-effort: never blocks the start_consultation response.
      if (doctorId) {
        const { data: nextUp } = await db.from('appointments')
          .select('id')
          .eq('hospital_id', appt.hospital_id).eq('check_in_date', checkInDate)
          .eq('status', 'checked_in').eq('queue_position', 2)
          .or(`doctor_id.eq.${doctorId},assigned_doctor_id.eq.${doctorId}`)
          .limit(1).maybeSingle()
        if (nextUp) {
          const { data: claimed } = await db.from('appointments')
            .update({ next_up_alert_sent_at: new Date().toISOString() })
            .eq('id', nextUp.id).is('next_up_alert_sent_at', null).select('id')
          if (claimed?.length) {
            await notifyPatient(
              db, nextUp.id, 'queue_next_alert', "You're next!",
              'The doctor is now seeing the patient ahead of you — please be ready.',
            )
          }
        }
      }

      return NextResponse.json({ success: true })
    }

    case 'end_consultation': {
      // BH5: enforce state machine -- only 'in_progress' may be ended
      const { data: updated, error } = await db.from('appointments').update({
        status: 'completed', consult_ended_at: new Date().toISOString(),
      }).eq('id', id).eq('status', 'in_progress').select('id')
      if (error) return Errors.internal(error.message)
      if (!updated?.length) return Errors.validation(`Only an in-progress consultation can be ended (this one is ${appt.status})`)

      // BM4: end the virtual session (if any) now that the appointment is completed
      await db.from('virtual_sessions')
        .update({ status: 'ended', ended_at: new Date().toISOString() })
        .eq('appointment_id', id).eq('status', 'active')
      return NextResponse.json({ success: true })
    }

    case 'set_status': {
      // Bare status flip, no transition guard -- used by clinics/[clinicId]/page.tsx's
      // "Complete" button. Its "Check In" button used to call this with
      // status: 'checked_in' too, bypassing check_in_date/queue_position entirely;
      // it now calls the dedicated 'check_in' action above instead.
      // appointments.status is plain text with no CHECK constraint, so an
      // unvalidated write here could put a row into a state nothing else in the
      // system recognises — invisible to every queue and filter, and unfixable
      // through the UI. Whitelisted against the state machine the rest of the
      // app implements.
      if (!(APPOINTMENT_STATUSES as readonly string[]).includes(body.status)) {
        return Errors.validation(`Unknown status. Expected one of: ${APPOINTMENT_STATUSES.join(', ')}`)
      }
      const { data: updated, error } = await db.from('appointments')
        .update({ status: body.status, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('id')
      if (error) return Errors.internal(error.message)
      if (!updated?.length) return Errors.notFound('Appointment')
      return NextResponse.json({ success: true })
    }

    case 'update_consult_notes': {
      // Doctor-only, and only the doctor actually on this appointment -- there's
      // no RLS UPDATE policy on appointments for doctors at all (only SELECT, see
      // 20260811000002_rls_identity_and_scoping.sql), so this is the only path
      // that has ever actually persisted consult notes/diagnosis; the mobile and
      // doctors apps previously tried a direct client update here, which RLS
      // silently no-ops (0 rows affected, no error) -- see setConsultStatus's
      // equivalent fix for the same class of bug on status changes.
      if (caller.role !== 'doctor' || (caller.doctorId !== appt.doctor_id && caller.doctorId !== appt.assigned_doctor_id)) {
        return Errors.forbidden('Only the doctor on this appointment can update consult notes')
      }
      const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if ('notes' in body) update.doctor_notes = body.notes?.trim() || null
      if ('diagnosis' in body) update.diagnosis = body.diagnosis?.trim() || null
      const { error } = await db.from('appointments').update(update as any).eq('id', id)
      if (error) return Errors.internal(error.message)
      return NextResponse.json({ success: true })
    }

    case 'ring': {
      // Not gated to being exactly "next" -- a doctor or front desk can call a
      // checked-in patient in early if they're free, same as walking out to the
      // waiting room and calling a name. Doctor callers can only ring their own
      // patient; front_desk/admin are already hospital-scoped by the check at
      // the top of this handler.
      if (!['checked_in', 'in_progress'].includes(appt.status)) {
        return Errors.validation(`Cannot ring a patient with status ${appt.status}`)
      }
      if (caller.role === 'doctor' && caller.doctorId !== appt.doctor_id && caller.doctorId !== appt.assigned_doctor_id) {
        return Errors.forbidden('You can only ring your own patient')
      }

      const doctorId = appt.doctor_id ?? appt.assigned_doctor_id
      let doctorLabel = 'The doctor'
      if (doctorId) {
        const { data: doc } = await db.from('doctors').select('title, full_name').eq('id', doctorId).single()
        if (doc) doctorLabel = [(doc as any).title, (doc as any).full_name].filter(Boolean).join(' ') || doctorLabel
      }

      await notifyPatient(
        db, id, 'queue_ring', `${doctorLabel} is ready for you`,
        'Please make your way to the consultation room now.',
      )
      return NextResponse.json({ success: true })
    }

    default:
      return Errors.validation('Unknown action')
  }
}
