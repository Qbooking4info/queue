// Single source of truth for checking a patient in. Used by both the
// PATCH /api/appointments/[id] "check_in" action (web dashboard's
// appointments/queue pages, mobile front desk) and the "Front Desk" tab's
// updateAppointmentStatus server action -- previously that action did a bare
// status update with no check_in_date, so a patient checked in from
// /dashboard/frontdesk never actually joined today's queue unless their
// appointment happened to be dated today.
import { createAdminClient } from '@/lib/supabase/admin'
import { todayLocalDate } from '@/lib/dashboard-utils'

// Checks in a 'confirmed' or 'pending' appointment (pending is allowed so a front-desk
// walk-in check-in doesn't need a separate confirm tap first -- mobile's front desk
// screen has always allowed this). Sets check_in_date to today regardless of
// appointment_date, so a booking made for another day that shows up in person still
// joins today's physical queue -- get_doctor_queue matches on
// "appointment_date = today OR check_in_date = today".
//
// queue_position/estimated_wait are deliberately NOT set here -- the
// renumber_queue_after_change trigger (supabase/migrations/20260805000001_atomic_queue_renumbering.sql)
// assigns them atomically off checked_in_at the moment status flips to 'checked_in',
// under an advisory lock per (doctor, day). Computing them here in JS raced two
// concurrent check-ins against each other (both could read "0 others ahead" before
// either write landed) and produced duplicate queue_position values.
export async function checkInAppointment(
  db: ReturnType<typeof createAdminClient>, appointmentId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: appt, error: fetchErr } = await db
    .from('appointments')
    .select('status')
    .eq('id', appointmentId)
    .single()
  if (fetchErr || !appt) return { ok: false, error: 'Appointment not found' }

  const checkInDate = todayLocalDate()

  const { data: updated, error } = await db.from('appointments').update({
    status: 'checked_in', check_in_date: checkInDate, updated_at: new Date().toISOString(),
  } as any).eq('id', appointmentId).in('status', ['confirmed', 'pending']).select('id')

  if (error) return { ok: false, error: error.message }
  if (!updated?.length) return { ok: false, error: `Only a confirmed or pending appointment can be checked in (this one is ${(appt as any).status})` }
  return { ok: true }
}
