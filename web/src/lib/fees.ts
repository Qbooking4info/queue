import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Server-side fee authority.
 *
 * THE SECURITY POINT: the amount charged is computed here, from database values,
 * and never accepted from the client. mobile/lib/fees.ts computes the same
 * number for display, but a client-supplied amount is a client-controlled
 * amount — a patient could otherwise initialise a ₦1 transaction for a ₦20,500
 * consultation and the webhook would happily mark it paid.
 *
 * Keep in step with mobile/lib/fees.ts, which quotes the patient at checkout.
 * The two cannot share a module across the mobile/web boundary; they have
 * drifted before (1.5x vs 2x emergency premium) and the fix was to name the
 * constant in both places and cross-reference.
 */

export const PLATFORM_FEE = 500
export const EMERGENCY_FEE_MULTIPLIER = 2

export interface FeeBreakdown {
  /** What the hospital is owed. */
  baseFee: number
  /** Emergency uplift, also owed to the hospital. */
  emergencyPremium: number
  /** Queue's cut. */
  platformFee: number
  /** Total charged to the patient, in naira. */
  total: number
  /** Total in kobo — Paystack works in the currency's minor unit. */
  totalKobo: number
  /** Of the total, what settles to the hospital. */
  hospitalPayout: number
}

export function computeFee(baseFee: number, isEmergency: boolean): FeeBreakdown {
  const base = Math.max(0, Math.round(baseFee || 0))
  const premium = isEmergency ? Math.round(base * (EMERGENCY_FEE_MULTIPLIER - 1)) : 0
  const total = base + premium + PLATFORM_FEE
  return {
    baseFee: base,
    emergencyPremium: premium,
    platformFee: PLATFORM_FEE,
    total,
    totalKobo: total * 100,
    hospitalPayout: base + premium,
  }
}

/**
 * Resolve what an appointment actually costs, from the appointment row and the
 * hospital/doctor it points at. Never takes a number from the caller.
 *
 * Mirrors the booking screens: doctor-mode bookings use the doctor's own fee
 * (virtual_fee for video consults), hospital-mode uses the hospital's OPD fee.
 */
export async function resolveAppointmentFee(
  db: ReturnType<typeof createAdminClient>,
  appointmentId: string,
): Promise<{ fee: FeeBreakdown; hospitalId: string; patientId: string | null } | null> {
  const { data: appt } = await db
    .from('appointments')
    .select(`
      id, hospital_id, patient_id, type, booking_mode, urgency, status,
      doctor:doctors!appointments_doctor_id_fkey(consultation_fee, virtual_fee),
      hospital:hospitals!appointments_hospital_id_fkey(opd_fee)
    `)
    .eq('id', appointmentId)
    .single()

  if (!appt) return null

  const a = appt as unknown as {
    hospital_id: string
    patient_id: string | null
    type: string
    booking_mode: string | null
    urgency: string | null
    doctor: { consultation_fee: number | null; virtual_fee: number | null } | null
    hospital: { opd_fee: number | null } | null
  }

  const base = a.booking_mode === 'doctor'
    ? (a.type === 'virtual'
        ? (a.doctor?.virtual_fee ?? a.doctor?.consultation_fee ?? 0)
        : (a.doctor?.consultation_fee ?? 0))
    : (a.hospital?.opd_fee ?? 0)

  return {
    fee: computeFee(base, a.urgency === 'emergency'),
    hospitalId: a.hospital_id,
    patientId: a.patient_id,
  }
}
