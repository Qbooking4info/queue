import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { dark as t, radius, font, spacing } from '../../lib/theme'

interface Hospital {
  id: string; name: string; type: string
  city: string; state: string; avg_rating: number; review_count: number
  accepts_virtual: boolean; is_verified: boolean
  hospital_specialties?: { specialties: { name: string; icon: string | null } | null }[]
}

interface Props { hospital: Hospital; onPress: () => void }

export function HospitalCard({ hospital: h, onPress }: Props) {
  const initials = h.name.split(' ').map(w => w[0]).join('').slice(0, 3).toUpperCase()
  const specialtyNames = h.hospital_specialties?.slice(0, 3).map(s => s.specialties?.name).filter(Boolean) ?? []

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={styles.card}>
      <View style={styles.row}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={styles.info}>
          <View style={styles.titleRow}>
            <Text style={styles.name} numberOfLines={1}>{h.name}</Text>
            {h.is_verified && <Text style={{ color: t.accent, fontSize: 13 }}>✓</Text>}
          </View>
          <Text style={styles.location}>{h.city}, {h.state}</Text>
          <View style={styles.meta}>
            {h.avg_rating ? (
              <>
                <Text style={styles.rating}>★ {h.avg_rating.toFixed(1)}</Text>
                <Text style={styles.dot}>·</Text>
                <Text style={styles.reviews}>({h.review_count})</Text>
              </>
            ) : (
              <Text style={styles.reviews}>New</Text>
            )}
            {h.accepts_virtual && <>
              <Text style={styles.dot}>·</Text>
              <Text style={styles.virtual}>Virtual</Text>
            </>}
          </View>
        </View>
      </View>
      {specialtyNames.length > 0 && (
        <View style={styles.tags}>
          {specialtyNames.map(s => (
            <View key={s} style={styles.tag}>
              <Text style={styles.tagText}>{s}</Text>
            </View>
          ))}
        </View>
      )}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  card:       { backgroundColor: t.bgCard, borderWidth: 1, borderColor: t.border, borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.sm },
  row:        { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  avatar:     { width: 44, height: 44, borderRadius: 13, backgroundColor: '#1A3A28', borderWidth: 1, borderColor: t.accentBorder, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: t.accent, fontSize: font.xs, fontWeight: '800', letterSpacing: -0.5 },
  info:       { flex: 1 },
  titleRow:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  name:       { fontSize: font.md, fontWeight: '700', color: t.text, flex: 1 },
  location:   { fontSize: font.xs, color: t.textSub, marginTop: 1 },
  meta:       { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
  rating:     { fontSize: font.xs, color: '#FFB547', fontWeight: '700' },
  dot:        { fontSize: font.xs, color: t.textMuted },
  reviews:    { fontSize: font.xs, color: t.textMuted },
  virtual:    { fontSize: font.xs, color: '#5B9EFF', fontWeight: '600' },
  tags:       { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 10 },
  tag:        { backgroundColor: t.bgCardAlt, borderWidth: 1, borderColor: t.border, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3 },
  tagText:    { fontSize: 10, color: t.textSub },
})
