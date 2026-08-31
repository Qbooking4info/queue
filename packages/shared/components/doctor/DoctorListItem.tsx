import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../../contexts/ThemeContext'
import type { IndependentDoctor } from '../../lib/api'

interface Props { doctor: IndependentDoctor; onPress: () => void }

export function DoctorListItem({ doctor: d, onPress }: Props) {
  const { theme: t } = useTheme()
  return (
    <TouchableOpacity onPress={onPress}
      style={[st.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
      <View style={[st.avatar, { backgroundColor: t.accentBgMid, borderColor: t.accentBorder }]}>
        <Text style={{ fontSize: 15, fontWeight: '800', color: t.accent }}>
          {d.fullName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[st.name, { color: t.textPrimary }]}>{d.title ? `${d.title} ` : ''}{d.fullName}</Text>
        <Text style={[st.specialty, { color: t.accent }]}>
          {d.specialty?.name ?? 'General Practice'}{d.level ? ` · ${d.level}` : ''}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
          {d.acceptsDirectVirtual && (
            <View style={[st.badge, { backgroundColor: 'rgba(55,138,221,0.12)' }]}>
              <Ionicons name="videocam-outline" size={10} color="#378ADD" />
              <Text style={[st.badgeText, { color: '#378ADD' }]}>Virtual</Text>
            </View>
          )}
          {d.acceptsDirectHomeVisit && (
            <View style={[st.badge, { backgroundColor: t.accentBgMid }]}>
              <Ionicons name="home-outline" size={10} color={t.accent} />
              <Text style={[st.badgeText, { color: t.accent }]}>Home Visit</Text>
            </View>
          )}
          {!d.acceptsDirectVirtual && !d.acceptsDirectHomeVisit && d.hospitals.length > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Ionicons name="business-outline" size={10} color={t.textMuted} />
              <Text style={[st.badgeText, { color: t.textMuted, fontWeight: '600' }]} numberOfLines={1}>
                {d.hospitals.map(h => h.name).join(', ')}
              </Text>
            </View>
          )}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={16} color={t.textMuted} />
    </TouchableOpacity>
  )
}

const st = StyleSheet.create({
  card:      { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 20, marginBottom: 10, borderRadius: 14, borderWidth: 1, padding: 14 },
  avatar:    { width: 46, height: 46, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  name:      { fontSize: 14, fontWeight: '700' },
  specialty: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  badge:     { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  badgeText: { fontSize: 9, fontWeight: '700' },
})
