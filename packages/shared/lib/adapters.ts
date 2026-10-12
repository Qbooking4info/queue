import type { DisplayHospital } from '../components/hospital/HospitalCard'
import type { HospitalWithDoctors } from './api'

// Fully saturated, mid-tone colors -- always readable with the white initials
// text painted on top regardless of theme, unlike the near-black set these
// replaced (tuned only for a dark card background; on a light-mode card they'd
// have read as almost invisible). Matches the mockups' own hospital avatar
// palette (Lagos Island General/Eko Specialist/Victoria Crown/Reddington),
// extended by two more distinct hues so more than 4 hospitals still visibly vary.
const AVATAR_BG = ['#006D3E','#005DB8','#7B4100','#4B3694','#B45309','#0E7490']

// Exported so any avatar (a doctor row in the booking flow, not just a
// hospital card) can get the same "different colors per tile" treatment
// from just a name, instead of a single hardcoded color for every avatar.
export function bgFromName(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_BG[Math.abs(h) % AVATAR_BG.length]
}

function initials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').slice(0, 3).toUpperCase()
}

export function toDisplayHospital(h: HospitalWithDoctors): DisplayHospital {
  // 1. Registered specialties via hospital_specialties table (the explicit list)
  const registeredSpecialties: string[] = [
    ...new Set(
      (h.hospital_specialties ?? [])
        .map(hs => hs.specialty?.name)
        .filter((n): n is string => !!n)
    ),
  ]

  // 2. Doctor-derived specialties as fallback / supplement
  const doctorSpecialties: string[] = [
    ...new Set(
      (h.doctors ?? [])
        .map(d => (d as any).specialty?.name)
        .filter((n): n is string => !!n)
    ),
  ]

  // 3. Merge: registered first, then any doctor specialties not already listed
  const mergedSpecialties = [
    ...registeredSpecialties,
    ...doctorSpecialties.filter(s => !registeredSpecialties.includes(s)),
  ]

  // The "services" chips used for booking routing and specialty filtering
  // always use specialty names so filterBySpecialty in HomeScreen keeps working
  const services = mergedSpecialties.length > 0 ? mergedSpecialties : ['General Practice']

  // Derive a readable specialty summary for the subtitle
  const specialtyLine = mergedSpecialties.length > 0
    ? mergedSpecialties.slice(0, 2).join(' · ')
    : (h.type === 'clinic' ? 'Specialist Clinic' : 'Multi-Specialty')

  let tag = 'Open Now'; let tagType = 'open'
  if (h.accepts_virtual) { tag = 'Virtual'; tagType = 'virtual' }
  if (h.emergency_hours)  { tag = 'Open Now'; tagType = 'open' }

  return {
    id:        h.id,
    name:      h.name,
    specialty: specialtyLine,
    rating:    h.avg_rating   ?? 0,
    reviews:   h.review_count ?? 0,
    wait:      '~15 min',
    distance:  h.city ?? 'Nearby',
    latitude:  (h as any).latitude  ?? null,
    longitude: (h as any).longitude ?? null,
    address:   (h as any).address   ?? null,
    city:      h.city               ?? null,
    phone:     (h as any).phone     ?? null,
    tag, tagType,
    avatar:    initials(h.name),
    avatarBg:  bgFromName(h.name),
    services:  services.length ? services : ['General Practice'],
    virtual:   h.accepts_virtual ?? false,
    verified:  h.is_verified   ?? false,
    doctors:   h.doctors ?? [],
    hmo:       [],
    emergencySlots: h.emergency_hours ? 2 : 0,
    slots:     [],
    // Booking policy fields — forwarded from hospital record
    hospitalType:        (h as any).type             ?? null,
    clinic_model:        (h as any).clinic_model     ?? null,
    approval_mode:       (h as any).approval_mode    ?? null,
    opd_fee:             (h as any).opd_fee          ?? null,
    daily_booking_limit: (h as any).daily_booking_limit ?? null,
    requires_referral:   (h as any).requires_referral   ?? null,
    is_24_hours:         (h as any).is_24_hours          ?? null,
    bed_space_status:      h.bed_space_status      ?? null,
    bed_space_updated_at:  h.bed_space_updated_at  ?? null,
  }
}
