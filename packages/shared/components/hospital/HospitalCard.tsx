import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useTheme } from '../../contexts/ThemeContext'
import { Avatar } from '../ui/Avatar'
import { Stars } from '../ui/Stars'
import { StatusBadge } from '../ui/StatusBadge'
import { Glass } from '../ui/Glass'
import { ValueChip } from '../ui/ValueChip'
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
  clinic_model?:       string | null
  approval_mode?:      string | null
  opd_fee?:            number | null
  daily_booking_limit?: number | null
  requires_referral?:  boolean | null
  is_24_hours?:        boolean | null
  bed_space_status?:      BedSpaceStatus | null
  bed_space_updated_at?:  string | null
}

interface Props { hospital: DisplayHospital; onPress: () => void }

// Pulls the leading number out of "15 min" so the wait can sit in a ValueChip,
// where the figure is the point. Anything non-numeric ("—", "Unknown") falls
// back to rendering the string as-is rather than showing a blank chip.
function splitWait(wait: string): { value: string; unit: string } {
  const m = /^(\d+)\s*(.*)$/.exec(wait?.trim() ?? '')
  if (!m) return { value: wait || '—', unit: 'wait' }
  return { value: m[1], unit: `${m[2] || 'min'} wait` }
}

// Glass-language hospital tile: one frosted panel, the hospital's own avatar
// colour as the only saturation, and the wait time raised into a solid chip so
// it stays the most legible thing on the card.
//
// `blur={false}` on purpose -- these render in lists, and BlurView is expensive
// on the low-end Android hardware this product targets. The translucent fill
// still reads as glass against the backdrop; the real blur is spent on
// singular panels (profile cards, heroes) where there is only ever one.
export function HospitalCard({ hospital: h, onPress }: Props) {
  const { theme: t } = useTheme()
  const wait = splitWait(h.wait)

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={{ marginBottom: 10 }}>
      <Glass radius={22} pad={14} blur={false}>
        <View style={styles.headerRow}>
          <Avatar initials={h.avatar} bg={h.avatarBg} size={46} />

          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={styles.topRow}>
              <Text style={[styles.name, { color: t.textPrimary }]} numberOfLines={1}>{h.name}</Text>
              {h.verified && (
                <View style={[styles.verifiedBadge, { backgroundColor: t.accentSoft, borderColor: t.accentBorder }]}>
                  <Text style={[styles.verifiedText, { color: t.accent }]}>✓</Text>
                </View>
              )}
            </View>
            <Text style={[styles.specialty, { color: t.textFaint }]} numberOfLines={1}>{h.specialty}</Text>
            <View style={styles.ratingRow}>
              <Stars rating={h.rating} />
              <Text style={[styles.reviews, { color: t.textFaint }]}>({h.reviews})</Text>
            </View>
          </View>

          <ValueChip value={wait.value} unit={wait.unit} tall={false} />
        </View>

        <View style={styles.tags}>
          <StatusBadge type={h.tagType} />
          {h.virtual && (
            <View style={[styles.tag, { backgroundColor: t.statusVirtual.bg, borderColor: t.statusVirtual.border }]}>
              <Text style={[styles.tagText, { color: t.statusVirtual.text }]}>Virtual visits</Text>
            </View>
          )}
          {(h.emergencySlots ?? 0) > 0 && (
            <View style={[styles.tag, { backgroundColor: t.statusCancelled.bg, borderColor: t.statusCancelled.border }]}>
              <Text style={[styles.tagText, { color: t.statusCancelled.text }]}>Emergency</Text>
            </View>
          )}
          {h.is_24_hours && (
            <View style={[styles.tag, { backgroundColor: t.accentSoft, borderColor: t.accentBorder }]}>
              <Text style={[styles.tagText, { color: t.accent }]}>24/7</Text>
            </View>
          )}
          <View style={[styles.tag, { backgroundColor: t.statusNeutral.bg, borderColor: t.statusNeutral.border }]}>
            <Text style={[styles.tagText, { color: t.statusNeutral.text }]}>{h.distance}</Text>
          </View>
        </View>

        {h.services.length > 0 && (
          <Text style={[styles.services, { color: t.textFaint }]} numberOfLines={1}>
            {h.services.slice(0, 3).join(' · ')}
            {h.services.length > 3 ? `  +${h.services.length - 3} more` : ''}
          </Text>
        )}
      </Glass>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  headerRow:    { flexDirection: 'row', gap: 12, alignItems: 'center' },
  topRow:       { flexDirection: 'row', alignItems: 'center', gap: 5 },
  name:         { fontSize: 14.5, fontWeight: '600', letterSpacing: -0.2, flexShrink: 1 },
  verifiedBadge:{ borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1, borderWidth: 1 },
  verifiedText: { fontSize: 9, fontWeight: '700' },
  specialty:    { fontSize: 11.5, marginTop: 2 },
  ratingRow:    { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  reviews:      { fontSize: 11.5 },
  tags:         { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 12 },
  tag:          { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  tagText:      { fontSize: 11, fontWeight: '500' },
  services:     { fontSize: 11, marginTop: 10 },
})
