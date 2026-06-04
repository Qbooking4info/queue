import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useTheme } from '../../contexts/ThemeContext'
import { Avatar } from '../ui/Avatar'
import { Stars } from '../ui/Stars'
import { StatusBadge } from '../ui/StatusBadge'
import type { Hospital } from '../../data'

interface Props { hospital: Hospital; onPress: () => void }

export function HospitalCard({ hospital: h, onPress }: Props) {
  const { theme: t } = useTheme()
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75}
      style={[styles.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
      <View style={styles.row}>
        <Avatar initials={h.avatar} bg={h.avatarBg} size={46} />
        <View style={styles.info}>
          <View style={styles.topRow}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={[styles.name, { color: t.textPrimary }]} numberOfLines={1}>{h.name}</Text>
                {h.verified && <Text style={{ fontSize: 12, color: t.accent }}>✓</Text>}
              </View>
              <Text style={[styles.specialty, { color: t.textMuted }]}>{h.specialty}</Text>
            </View>
            <StatusBadge type={h.tagType} />
          </View>
          <View style={styles.metaRow}>
            <Stars rating={h.rating} />
            <Text style={[styles.meta, { color: t.textMuted }]}>({h.reviews})</Text>
            <Text style={[styles.meta, { color: t.textMuted }]}>·</Text>
            <Text style={[styles.meta, { color: t.textSecondary }]}>⏱ {h.wait}</Text>
            <Text style={[styles.meta, { color: t.textMuted }]}>·</Text>
            <Text style={[styles.meta, { color: t.textSecondary }]}>📍 {h.distance}</Text>
          </View>
          <View style={styles.tags}>
            {h.services.slice(0, 3).map(s => (
              <View key={s} style={[styles.tag, { backgroundColor: t.inputBg, borderColor: t.cardBorder }]}>
                <Text style={[styles.tagText, { color: t.textMuted }]}>{s}</Text>
              </View>
            ))}
            {h.services.length > 3 && <Text style={[styles.tagText, { color: t.textMuted }]}>+{h.services.length - 3}</Text>}
            {h.virtual && <Text style={[styles.tagText, { color: t.accent, fontWeight: '600' }]}>💻 Virtual</Text>}
          </View>
        </View>
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  card:     { borderRadius: 18, padding: 14, marginBottom: 10, borderWidth: 1 },
  row:      { flexDirection: 'row', gap: 12 },
  info:     { flex: 1, minWidth: 0 },
  topRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
  name:     { fontSize: 14, fontWeight: '700', letterSpacing: -0.3 },
  specialty:{ fontSize: 11, marginTop: 1 },
  metaRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 },
  meta:     { fontSize: 11 },
  tags:     { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  tag:      { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1 },
  tagText:  { fontSize: 10 },
})
