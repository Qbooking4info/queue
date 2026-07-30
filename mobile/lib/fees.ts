// Booking fee math, in one place.
//
// This used to be duplicated per screen and the copies disagreed:
// EmergencyBookingScreen applied a 2.0x multiplier (and rendered a "2x fee"
// badge), while BookingFlowScreen added a 0.5x premium — so the same emergency
// booking was quoted 1.5x base in one flow and 2x base in the other.
//
// 2x is authoritative: it's what the server actually books the appointment at.
// web/src/app/api/appointments/stats/route.ts::computeAppointmentFee uses
// `urgency === 'emergency' ? 2 : 1` plus the same flat platform fee, so a 1.5x
// quote meant the patient was shown one number and the hospital's revenue
// reporting recorded another.
//
// These constants are deliberately duplicated across the mobile/web boundary
// (the two can't share a module — same constraint as the column lists in
// lib/api.ts). If you change either value, change it in stats/route.ts too.

export const PLATFORM_FEE = 500

export const EMERGENCY_FEE_MULTIPLIER = 2.0

/** Premium charged on top of the base fee for an emergency booking. */
export function emergencyPremium(baseFee: number): number {
  return Math.round(baseFee * (EMERGENCY_FEE_MULTIPLIER - 1))
}

/** Total the patient is quoted: base + emergency premium (if any) + platform fee. */
export function totalBookingFee(baseFee: number, isEmergency: boolean): number {
  return baseFee + (isEmergency ? emergencyPremium(baseFee) : 0) + PLATFORM_FEE
}
