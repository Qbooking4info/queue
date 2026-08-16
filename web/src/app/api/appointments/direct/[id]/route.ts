import { createAdminClient } from '@/lib/supabase/admin'
import { getServerUser } from '@/lib/supabase/auth-server'
import { NextRequest, NextResponse } from 'next/server'
import { Errors } from '@/lib/api-error'
import { AUTH_CORS_HEADERS, corsOptions } from '@/lib/cors'

type Action =
  | { action: 'approve' }
  | { action: 'reject'; reason: string }
  | { action: 'start' } // home-visit only; virtual consults start via POST /api/virtual/token
  | { action: 'complete'; diagnosis?: string; doctorNotes?: string }
  | { action: 'cancel'; reason: string }

export async function OPTIONS() {
  return corsOptions()
}

// Doctor-side actions on their own DIRECT (hospital-less) bookings.
// PATCH /api/appointments/[id] can't be reused for these: it gates every
// action on `caller.hospitalId === appt.hospital_id`, which a direct
// booking's NULL hospital_id can never satisfy (see the comment in
// 20260817000001_direct_doctor_booking.sql). Scoped instead by
// doctor_user_id === caller's own users.id.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const res = await handlePATCH(req, { params })
  for (const [k, v] of Object.entries(AUTH_CORS_HEADERS)) res.headers.set(k, v)
  return res
}

async function handlePATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getServerUser(req)
  if (!user) return Errors.unauthenticated()
  const { id } = await params

  const db = createAdminClient()
  const { data: profile } = await db.from('users').select('id').eq('auth_id', user.id).single()
  if (!profile) return Errors.notFound('User profile')

  const { data: appt } = await db
    .from('appointments')
    .select('id, status, type, doctor_user_id, hospital_id')
    .eq('id', id)
    .single()

  if (!appt || appt.hospital_id !== null) return Errors.notFound('Appointment')
  if (appt.doctor_user_id !== profile.id) return Errors.forbidden("Cannot modify another doctor's booking")

  const body = (await req.json()) as Action

  switch (body.action) {
    case 'approve': {
      if (appt.status !== 'pending') return Errors.validation(`Cannot approve from status '${appt.status}'`)
      const { error } = await db.from('appointments')
        .update({ status: 'confirmed', approval_status: 'approved' })
        .eq('id', id)
      if (error) return Errors.internal(error.message)
      return NextResponse.json({ success: true })
    }
    case 'reject': {
      if (appt.status !== 'pending') return Errors.validation(`Cannot reject from status '${appt.status}'`)
      if (!body.reason?.trim()) return Errors.validation('reason is required')
      const { error } = await db.from('appointments')
        .update({ status: 'cancelled', approval_status: 'rejected', cancellation_reason: body.reason.trim(), cancelled_at: new Date().toISOString() })
        .eq('id', id)
      if (error) return Errors.internal(error.message)
      return NextResponse.json({ success: true })
    }
    case 'start': {
      if (appt.type !== 'home_visit') return Errors.validation('Virtual consults start via /api/virtual/token')
      if (appt.status !== 'confirmed') return Errors.validation(`Cannot start from status '${appt.status}'`)
      const { error } = await db.from('appointments')
        .update({ status: 'in_progress', consult_started_at: new Date().toISOString() })
        .eq('id', id)
      if (error) return Errors.internal(error.message)
      return NextResponse.json({ success: true })
    }
    case 'complete': {
      if (appt.status !== 'in_progress') return Errors.validation(`Cannot complete from status '${appt.status}'`)
      const { error } = await db.from('appointments')
        .update({
          status: 'completed',
          consult_ended_at: new Date().toISOString(),
          ...(body.diagnosis ? { diagnosis: body.diagnosis } : {}),
          ...(body.doctorNotes ? { doctor_notes: body.doctorNotes } : {}),
        })
        .eq('id', id)
      if (error) return Errors.internal(error.message)
      return NextResponse.json({ success: true })
    }
    case 'cancel': {
      if (!['pending', 'confirmed'].includes(appt.status)) return Errors.validation(`Cannot cancel from status '${appt.status}'`)
      if (!body.reason?.trim()) return Errors.validation('reason is required')
      const { error } = await db.from('appointments')
        .update({ status: 'cancelled', cancellation_reason: body.reason.trim(), cancelled_at: new Date().toISOString() })
        .eq('id', id)
      if (error) return Errors.internal(error.message)
      return NextResponse.json({ success: true })
    }
    default:
      return Errors.validation('Unknown action')
  }
}
