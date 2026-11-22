import { View } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../../contexts/ThemeContext'
import { EntityAvatar } from '../ui/EntityAvatar'
import { Row, Mono } from '../q'
import type { BedSpaceStatus } from '../../lib/api'

export interface DisplayHospital {
  id:        string | number
  name:      string
  specialty: string
  rating:    number
  reviews:   number
  wait:      string
  distance:  string
  tag:       string
  tagType:   string
  avatar:    string
  avatarBg:  string
  logoUrl?:  string | null
  services:  string[]
  virtual:   boolean
  verified:  boolean
  slots?:    string[]
  doctors?:  any[]
  hmo?:      string[]
  emergencySlots?: number
  // Geographic coordinates
  latitude?:  number | null
  longitude?: number | null
  address?:   string | null
  city?:      string | null
  phone?:     string | null
  // Booking policy fields
  hospitalType?:       string | null
  ownership?:          string | null
  clinic_model?:       string | null
  approval_mode?:      string | null
  opd_fee?:            number | null
  daily_booking_limit?: number | null
  requires_referral?:  boolean | null
  is_24_hours?:        boolean | null
  bed_space_status?:      BedSpaceStatus | null
  bed_space_updated_at?:  string | null
}

interface Props { hospital: DisplayHospital; onPress: () => void; distanceKm?: number | null }

/**
 * One hospital, as a row inside a card -- the v4 handoff's find-care list.
 *
 * It was a free-standing bordered card with a rating, a wait figure, three
 * service chips and two badges. The handoff puts hospitals in one card as
 * hairline-separated rows carrying a name, a place-and-opening line, and the
 * OPD fee, because that is what someone choosing a hospital compares. The
 * dropped figures were not all real anyway: `wait` was the hardcoded string
 * "~15 min" for every hospital in the list.
 */
export function HospitalCard({ hospital: h, onPress, distanceKm }: Props) {
  const { theme: t } = useTheme()
  const where = [
    h.city,
    h.specialty,
    h.is_24_hours ? 'open 24 hours' : null,
    distanceKm != null ? (distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${distanceKm.toFixed(1)} km`) : null,
  ].filter(Boolean).join(' · ')

  return (
    <Row
      leading={
        <EntityAvatar
          size={40}
          kind="hospital"
          uri={h.logoUrl}
          label={h.name}
          hospital={{ type: h.hospitalType, ownership: h.ownership, clinicModel: h.clinic_model }}
        />
      }
      title={h.name}
      sub={where || null}
      right={
        <View style={{ alignItems: 'flex-end', gap: 2 }}>
          {h.opd_fee != null && <Mono size={13} weight="700">₦{Number(h.opd_fee).toLocaleString('en-NG')}</Mono>}
          {h.virtual && <Ionicons name="videocam-outline" size={13} color={t.q.primary} />}
        </View>
      }
      chevron
      onPress={onPress}
    />
  )
}
