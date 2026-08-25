import { supabase } from './supabase'

const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '')

async function authHeader(): Promise<Record<string, string> | null> {
  const { data: { session } } = await supabase.auth.getSession()
  const jwt = session?.access_token
  return jwt ? { Authorization: `Bearer ${jwt}` } : null
}

// Shared by PatientConsultScreen's Start/End buttons and the live queue's inline
// quick actions. Goes through PATCH /api/appointments/[id] (start_consultation/
// end_consultation actions) rather than a direct client-side
// `supabase.from('appointments').update(...)` -- there has never been an RLS
// UPDATE policy on `appointments` for doctors (only SELECT, see
// 20260811000002_rls_identity_and_scoping.sql and every migration before it), so
// a direct client write from a doctor silently updates zero rows: no error,
// but nothing actually changes, which is why Start never flipped to End and
// nothing else watching the appointment (patients, front desk) ever saw the
// status change either. The service-role route already implements the
// auto-end-stale-in_progress side effect (and also closes orphaned
// virtual_sessions, which the old client-side version didn't).
export async function setConsultStatus(
  appointmentId: string,
  newStatus: 'in_progress' | 'completed',
): Promise<{ error: string | null }> {
  const headers = await authHeader()
  if (!headers) return { error: 'Not authenticated' }

  try {
    const res = await fetch(`${API_URL}/api/appointments/${appointmentId}`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: newStatus === 'in_progress' ? 'start_consultation' : 'end_consultation' }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) return { error: body?.error ?? 'Failed to update status' }
    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Network error' }
  }
}

// Calls the patient's phone with a push notification naming the doctor -- not
// gated to being exactly "next", a doctor can call a checked-in/in-progress
// patient in early if they're free. Same PATCH action the front desk app's
// Ring button also calls.
export async function ringPatient(appointmentId: string): Promise<{ error: string | null }> {
  const headers = await authHeader()
  if (!headers) return { error: 'Not authenticated' }

  try {
    const res = await fetch(`${API_URL}/api/appointments/${appointmentId}`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'ring' }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) return { error: body?.error ?? 'Failed to ring patient' }
    return { error: null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Network error' }
  }
}

export interface ConsultVitals {
  weight_kg: number | null
  height_cm: number | null
  bp_systolic: number | null
  bp_diastolic: number | null
  blood_sugar: number | null
}

// Neither vitals nor doctor_notes/diagnosis can be written by a direct client
// update -- vitals_audit_log has no client INSERT policy at all, and
// appointments has no doctor UPDATE policy (see setConsultStatus above). Both
// go through service-role routes.
//
// vitals is nullable -- the server rejects a vitals write for an appointment
// that isn't checked_in/in_progress, and the consult screen still needs to
// let a doctor save clinical notes/diagnosis before that point without also
// firing a vitals request that's guaranteed to fail.
export async function saveConsultVitalsAndNotes(
  appointmentId: string,
  vitals: ConsultVitals | null,
  notes: { notes: string; diagnosis: string },
): Promise<{ error: string | null }> {
  const headers = await authHeader()
  if (!headers) return { error: 'Not authenticated' }

  const notesReq = fetch(`${API_URL}/api/appointments/${appointmentId}`, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'update_consult_notes', ...notes }),
  })

  if (!vitals) {
    const notesRes = await notesReq
    if (notesRes.ok) return { error: null }
    const failed = await notesRes.json().catch(() => ({}))
    return { error: failed?.error ?? 'Please try again' }
  }

  const [vitalsRes, notesRes] = await Promise.all([
    fetch(`${API_URL}/api/appointments/${appointmentId}/vitals`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(vitals),
    }),
    notesReq,
  ])

  if (vitalsRes.ok && notesRes.ok) return { error: null }
  const failed = await (vitalsRes.ok ? notesRes : vitalsRes).json().catch(() => ({}))
  return { error: failed?.error ?? 'Please try again' }
}
