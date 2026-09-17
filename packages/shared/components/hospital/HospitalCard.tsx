import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useTheme } from '../../contexts/ThemeContext'
import { Avatar } from '../ui/Avatar'
import { Stars } from '../ui/Stars'
import { StatusBadge } from '../ui/StatusBadge'
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

// Matches the mockup's HospitalCard/Card exactly: no border at all -- the
// mockup's Card relies purely on a shadow for separation from the page
// behind it, not a 1px border like every other card in this app used to.
// Also picks up the mockup's "tonal header strip" -- the avatar/name/rating
// block sits on a tint of the hospital's OWN avatar color (not a flat
// t.cardBg), visually tying the card to that hospital's color the same way
// the mockup's varied avatarBg colors do -- and only the body below (wait/
// distance/services) sits on the plain card surface.
export function HospitalCard({ hospital: h, onPress }: Props) {
  const { theme: t } = useTheme()
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={[styles.card, { backgroundColor: t.cardBg }]}>
      {/* Tonal header strip */}
      <View style={[styles.headerStrip, { backgroundColor: h.avatarBg + '22', borderBottomColor: t.cardBorder }]}>
        <View style={styles.headerRow}>
          <Avatar initials={h.avatar} bg={h.avatarBg} size={52} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={styles.topRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1 }}>
                <Text style={[styles.name, { color: t.textPrimary }]} numberOfLines={1}>{h.name}</Text>
                {h.verified && (
                  <View style={[styles.verifiedBadge, { backgroundColor: t.accent }]}>
                    <Text style={[styles.verifiedText, { color: t.onAccent }]}>✓</Text>
                  </View>
                )}
              </View>
              <StatusBadge type={h.tagType} />
            </View>
            <Text style={[styles.specialty, { color: t.textSecondary }]}>{h.specialty}</Text>
            <View style={styles.ratingRow}>
              <Stars rating={h.rating} />
              <Text style={[styles.reviews, { color: t.textSecondary }]}>({h.reviews} reviews)</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Body */}
      <View style={styles.body}>
        <View style={styles.metaRow}>
          <Text style={[styles.metaText, { color: t.textPrimary }]}>⏱ {h.wait} wait</Text>
          <Text style={[styles.metaText, { color: t.textPrimary }]}>📍 {h.distance}</Text>
          {h.virtual && <Text style={[styles.metaText, { color: t.accent, fontWeight: '700' }]}>💻 Virtual</Text>}
          {(h.emergencySlots ?? 0) > 0 && <Text style={[styles.metaText, { color: t.danger, fontWeight: '700' }]}>🚨 Emergency</Text>}
        </View>
        <View style={styles.tags}>
          {h.services.slice(0, 3).map(s => (
            <View key={s} style={[styles.tag, { backgroundColor: t.inputBg }]}>
              <Text style={[styles.tagText, { color: t.textSecondary }]}>{s}</Text>
            </View>
          ))}
          {h.services.length > 3 && (
            <Text style={[styles.moreText, { color: t.accent }]}>+{h.services.length - 3} more</Text>
          )}
          {h.is_24_hours && (
            <View style={[styles.tag, { backgroundColor: t.accentContainer }]}>
              <Text style={[styles.tagText, { color: t.onAccentContainer, fontWeight: '700' }]}>24/7</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    // Shadow-only elevation, no border -- see the file header comment.
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  headerStrip:  { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, borderBottomWidth: 1 },
  headerRow:    { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  topRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 3 },
  name:         { fontSize: 15, fontWeight: '700', letterSpacing: -0.2 },
  verifiedBadge:{ borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1 },
  verifiedText: { fontSize: 10, fontWeight: '700' },
  specialty:    { fontSize: 12, fontWeight: '500' },
  ratingRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  reviews:      { fontSize: 12, fontWeight: '500' },
  body:         { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12 },
  metaRow:      { flexDirection: 'row', gap: 16, marginBottom: 10, flexWrap: 'wrap' },
  metaText:     { fontSize: 12, fontWeight: '600' },
  tags:         { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  tag:          { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 6 },
  tagText:      { fontSize: 11, fontWeight: '600' },
  moreText:     { fontSize: 11, fontWeight: '600' },
})
