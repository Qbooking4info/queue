import type { Hospital, Doctor } from '../types/database'
import type { DisplayHospital } from '../components/hospital/HospitalCard'

const AVATAR_BG = ['#1A4A32','#1A2A4A','#3A1A0E','#2A1A40','#1A3A1A','#2A2A1A']

function bgFromName(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return AVATAR_BG[Math.abs(h) % AVATAR_BG.length]
}

function initials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').slice(0, 3).toUpperCase()
}

export function toDisplayHospital(
  h: Hospital & { doctors?: (Doctor & { specialty?: { name: string; icon: string } | null })[] }
): DisplayHospital {
  // Collect unique specialty names from doctors
  const services = h.doctors
    ? [...new Set(
        h.doctors
          .map(d => d.specialty?.name)
          .filter((n): n is string => !!n)
      )].slice(0, 6)
    : []

  // Derive a readable specialty summary for the subtitle
  const specialtyLine = services.length > 0
    ? services.slice(0, 2).join(' · ')
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
  }
}
