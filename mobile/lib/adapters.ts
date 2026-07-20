import type { DisplayHospital } from '../components/hospital/HospitalCard'
import type { HospitalWithDoctors } from './api'

const AVATAR_BG = ['#1A4A32','#1A2A4A','#3A1A0E','#2A1A40','#1A3A1A','#2A2A1A']

function bgFromName(name: string): string {
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
  }
}
