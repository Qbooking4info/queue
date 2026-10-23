import { View, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Text } from './Typography'
import { EntityAvatar, type HospitalKind } from './EntityAvatar'
import { useTheme } from '../../contexts/ThemeContext'

/**
 * One tile in the Find care grid: circular image on top, then name, one line of
 * detail, a rating, and the action.
 *
 * Two per row, not three. At phone width (about 360px) minus the page's 20px
 * gutters, three columns leaves roughly 105px per tile -- not enough for a name,
 * a specialty and a tappable button without truncating all three. Two gives
 * about 160px, which fits them and keeps the button above the 44px target.
 */
export function GridCard({
  kind, uri, hospital, gender,
  title, subtitle, rating, reviews,
  badge, actionLabel, onPress,
}: {
  kind: 'hospital' | 'doctor'
  uri?: string | null
  hospital?: HospitalKind
  gender?: string | null
  title: string
  subtitle?: string | null
  rating?: number | null
  reviews?: number | null
  /** Small pill over the top-right, e.g. "Online". */
  badge?: { label: string; tone: 'online' | 'neutral' } | null
  actionLabel: string
  onPress: () => void
}) {
  const { theme: t } = useTheme()
  const dark = t.id === 'forest'
  const hasRating = typeof rating === 'number' && rating > 0

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}${subtitle ? `, ${subtitle}` : ''}${hasRating ? `, rated ${rating}` : ''}`}
      style={[st.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}
    >
      {!!badge && (
        <View style={[st.badge, {
          backgroundColor: badge.tone === 'online' ? t.statusSuccess.bg : t.accentBg,
          borderColor: badge.tone === 'online' ? t.statusSuccess.border : t.accentBorder,
        }]}>
          {badge.tone === 'online' && (
            <View style={[st.dot, { backgroundColor: t.statusSuccess.text }]} />
          )}
          <Text style={[st.badgeText, {
            color: badge.tone === 'online' ? t.statusSuccess.text : t.accent,
          }]} numberOfLines={1}>{badge.label}</Text>
        </View>
      )}

      <EntityAvatar size={62} kind={kind} uri={uri} hospital={hospital} gender={gender} />

      {/* Fixed two lines for the name so every tile in a row ends its button at
          the same height, whether the name wraps or not. */}
      <Text style={[st.title, { color: t.textPrimary }]} numberOfLines={2}>{title}</Text>

      {!!subtitle && (
        <Text style={[st.subtitle, { color: t.textMuted }]} numberOfLines={1}>{subtitle}</Text>
      )}

      <View style={st.ratingRow}>
        {hasRating ? (
          <>
            <Ionicons name="star" size={12} color={t.starColor} />
            <Text style={[st.rating, { color: t.textPrimary }]}>{rating!.toFixed(1)}</Text>
            {!!reviews && <Text style={[st.reviews, { color: t.textMuted }]}>({reviews})</Text>}
          </>
        ) : (
          <Text style={[st.reviews, { color: t.textMuted }]}>No ratings yet</Text>
        )}
      </View>

      <View style={[st.action, { backgroundColor: t.accent }]}>
        <Text style={[st.actionText, { color: dark ? '#081416' : '#FFFFFF' }]} numberOfLines={1}>
          {actionLabel}
        </Text>
      </View>
    </TouchableOpacity>
  )
}

const st = StyleSheet.create({
  card: {
    // flexBasis + grow, never flex:1: inside a wrapping row, flex:1 makes the
    // first tile fill the whole line and you get one column. A 45% basis fits
    // two and refuses a third (3 x 45% overflows), then grows to close the gap.
    flexGrow: 1,
    flexBasis: '45%',
    borderRadius: 18,
    borderWidth: 1,
    paddingTop: 16,
    paddingBottom: 12,
    paddingHorizontal: 12,
    alignItems: 'center',
    gap: 7,
  },
  badge: {
    position: 'absolute',
    top: 8, right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 99,
    borderWidth: 1,
    maxWidth: '72%',
  },
  dot: { width: 5, height: 5, borderRadius: 3 },
  badgeText: { fontSize: 9, fontWeight: '800' },

  title: {
    fontSize: 13.5,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 17,
    minHeight: 34,
  },
  subtitle: { fontSize: 11.5, textAlign: 'center' },

  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3, minHeight: 16 },
  rating:  { fontSize: 12, fontWeight: '700' },
  reviews: { fontSize: 11 },

  action: {
    alignSelf: 'stretch',
    minHeight: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    marginTop: 3,
  },
  actionText: { fontSize: 12, fontWeight: '800' },
})
