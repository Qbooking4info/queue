import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../../contexts/ThemeContext'
import { Avatar } from '../ui/Avatar'
import { Stars } from '../ui/Stars'
import { bgFromName } from '../../lib/adapters'
import type { IndependentDoctor } from '../../lib/api'

interface Props { doctor: IndependentDoctor; onPress: () => void }

// Fee shown alongside the rating -- whichever direct-booking visit type this
// doctor actually offers (a doctor can offer one, both, or neither if they're
// hospital-only). Prefers virtual since it's usually the cheaper/faster option
// to lead with, but either fee is equally valid to show here.
function leadFee(d: IndependentDoctor): number | null {
  if (d.acceptsDirectVirtual && d.virtualFee != null) return d.virtualFee
  if (d.acceptsDirectHomeVisit && d.homeVisitFee != null) return d.homeVisitFee
  return null
}

export function DoctorListItem({ doctor: d, onPress }: Props) {
  const { theme: t } = useTheme()
  const fee = leadFee(d)
  const bookable = d.acceptsDirectVirtual || d.acceptsDirectHomeVisit

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}
      style={[st.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
      <View style={st.topRow}>
        <Avatar
          initials={d.fullName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
          bg={bgFromName(d.fullName)} size={52}
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[st.specialty, { color: t.accent }]} numberOfLines={1}>
            {(d.specialty?.name ?? 'General Practice').toUpperCase()}
          </Text>
          <Text style={[st.name, { color: t.textPrimary }]} numberOfLines={1}>
            {d.title ? `${d.title} ` : ''}{d.fullName}
          </Text>
          <Text style={[st.sub, { color: t.textMuted }]} numberOfLines={1}>
            {d.hospitals.length > 0 ? d.hospitals.map(h => h.name).join(', ') : 'Independent practice'}
          </Text>
        </View>
      </View>

      {(d.avgRating != null || fee != null) && (
        <View style={st.metaRow}>
          {d.avgRating != null ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Stars rating={d.avgRating} />
              {d.reviewCount != null && (
                <Text style={[st.reviews, { color: t.textMuted }]}>· {d.reviewCount} reviews</Text>
              )}
            </View>
          ) : <View />}
          {fee != null && (
            <Text style={[st.fee, { color: t.textPrimary }]}>₦{fee.toLocaleString()} / visit</Text>
          )}
        </View>
      )}

      <View style={[st.divider, { backgroundColor: t.cardBorder }]} />

      <View style={st.bottomRow}>
        <View style={{ flexDirection: 'row', gap: 8, flexShrink: 1, flexWrap: 'wrap' }}>
          {d.acceptsDirectVirtual && (
            <View style={[st.badge, { backgroundColor: t.statusVirtual.bg }]}>
              <Ionicons name="videocam-outline" size={10} color={t.statusVirtual.text} />
              <Text style={[st.badgeText, { color: t.statusVirtual.text }]}>Virtual</Text>
            </View>
          )}
          {d.acceptsDirectHomeVisit && (
            <View style={[st.badge, { backgroundColor: t.accentBgMid }]}>
              <Ionicons name="home-outline" size={10} color={t.accent} />
              <Text style={[st.badgeText, { color: t.accent }]}>Home Visit</Text>
            </View>
          )}
          {!bookable && d.hospitals.length > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Ionicons name="business-outline" size={10} color={t.textMuted} />
              <Text style={[st.badgeText, { color: t.textMuted, fontWeight: '600' }]} numberOfLines={1}>
                Via hospital
              </Text>
            </View>
          )}
        </View>

        <View style={[st.bookBtn, { backgroundColor: t.accentContainer }]}>
          <Text style={[st.bookBtnText, { color: t.onAccentContainer }]}>
            {bookable ? 'Book Now' : 'View'}
          </Text>
          <Ionicons name="arrow-forward" size={12} color={t.onAccentContainer} />
        </View>
      </View>
    </TouchableOpacity>
  )
}

const st = StyleSheet.create({
  card:       { marginHorizontal: 20, marginBottom: 12, borderRadius: 16, borderWidth: 1, padding: 14 },
  topRow:     { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  specialty:  { fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
  name:       { fontSize: 17, fontWeight: '800', letterSpacing: -0.2, marginTop: 2 },
  sub:        { fontSize: 13, fontWeight: '600', marginTop: 2 },
  metaRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  reviews:    { fontSize: 12, fontWeight: '600' },
  fee:        { fontSize: 15, fontWeight: '800' },
  divider:    { height: 1, marginBottom: 10 },
  bottomRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  badge:      { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  badgeText:  { fontSize: 10, fontWeight: '700' },
  bookBtn:    { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99 },
  bookBtnText:{ fontSize: 13, fontWeight: '800' },
})
