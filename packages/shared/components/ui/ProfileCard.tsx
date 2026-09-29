import { View, Text, StyleProp, ViewStyle } from 'react-native'
import { useTheme } from '../../contexts/ThemeContext'
import { Glass } from './Glass'
import { Avatar } from './Avatar'
import { bgFromName } from '../../lib/adapters'

// Two characters, and "Dr. " dropped so a doctor doesn't read as "DR". Deliberately
// local rather than reusing adapters' own initials(): that one slices to three
// characters because hospital tiles want "LIG"-style marks, and changing it would
// alter every hospital card.
function initialsOf(name: string): string {
  return (name || '?')
    .replace(/^Dr\.?\s+/i, '')
    .split(/\s+/)
    .map(w => w[0])
    .filter(Boolean)
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

/**
 * The identity panel: avatar and name on one line, with an optional row of stats
 * underneath.
 *
 * Laid out horizontally rather than as a centred stack. Centred, the card had to be
 * as wide as its widest child and no wider, so it rendered as a narrow column
 * floating in the middle of the screen with the stat chips crushed together and
 * their labels wrapping. Reading left-to-right uses the width that is actually
 * there.
 *
 * Note the alignment lives on an inner View, never on the Glass itself: Glass
 * applies `style` to its outermost wrapper, so `alignItems: 'center'` there makes
 * the panel shrink-wrap its content instead of filling its container. That was the
 * original bug.
 */
export function ProfileCard({
  name, sub, badge, stats, style,
}: {
  name: string
  sub?: string | null
  badge?: React.ReactNode
  /** Up to about four; they share the row evenly. */
  stats?: { label: string; value: string }[]
  style?: StyleProp<ViewStyle>
}) {
  const { theme: t } = useTheme()
  return (
    <Glass radius={24} pad={16} style={style}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Avatar initials={initialsOf(name)} bg={bgFromName(name || '?')} size={60} />

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            numberOfLines={2}
            style={{ fontSize: 19, fontWeight: '700', color: t.textPrimary, letterSpacing: -0.3 }}
          >
            {name}
          </Text>
          {!!sub && (
            <Text numberOfLines={1} style={{ fontSize: 12.5, color: t.textSecondary, marginTop: 2 }}>
              {sub}
            </Text>
          )}
          {!!badge && <View style={{ marginTop: 8, flexDirection: 'row' }}>{badge}</View>}
        </View>
      </View>

      {!!stats?.length && (
        <>
          <View style={{ height: 1, backgroundColor: t.cardBorder, marginTop: 14, marginBottom: 12 }} />
          {/* One rule between columns instead of a box around each: three bordered
              chips side by side on a phone left almost no room for the label, which
              is why "This month" was wrapping onto two lines. */}
          <View style={{ flexDirection: 'row', alignItems: 'stretch' }}>
            {stats.map((s, i) => (
              <View key={s.label} style={{ flex: 1, flexDirection: 'row' }}>
                {i > 0 && <View style={{ width: 1, backgroundColor: t.cardBorder, marginHorizontal: 4 }} />}
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: t.textPrimary, letterSpacing: -0.3 }}>
                    {s.value}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={{ fontSize: 10.5, color: t.textSecondary, marginTop: 2 }}
                  >
                    {s.label}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </>
      )}
    </Glass>
  )
}
