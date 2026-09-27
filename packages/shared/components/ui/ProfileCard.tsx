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
 * The centred identity panel: ringed avatar, name, subline, an optional badge and a
 * row of raised stat chips.
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
  const { theme: t, chipElevation } = useTheme()
  return (
    <Glass radius={26} pad={20} style={[{ alignItems: 'center' }, style]}>
      <View style={{
        padding: 5, borderRadius: 999, marginBottom: 12,
        backgroundColor: t.glassStrong, borderWidth: 1, borderColor: t.glassBorder,
      }}>
        <Avatar initials={initialsOf(name)} bg={bgFromName(name || '?')} size={74} />
      </View>

      <Text style={{ fontSize: 21, fontWeight: '700', color: t.textPrimary, letterSpacing: -0.4, textAlign: 'center' }}>
        {name}
      </Text>
      {!!sub && (
        <Text style={{ fontSize: 12.5, color: t.textSecondary, marginTop: 2, textAlign: 'center' }}>{sub}</Text>
      )}
      {!!badge && <View style={{ marginTop: 10 }}>{badge}</View>}

      {!!stats?.length && (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 16, alignSelf: 'stretch' }}>
          {stats.map(s => (
            <View
              key={s.label}
              style={[{
                flex: 1, paddingVertical: 10, paddingHorizontal: 4, borderRadius: 16,
                alignItems: 'center', backgroundColor: t.chip,
                borderWidth: 1, borderColor: t.chipBorder,
              }, chipElevation]}
            >
              <Text style={{ fontSize: 17, fontWeight: '700', color: t.textPrimary }}>{s.value}</Text>
              <Text style={{ fontSize: 10.5, color: t.textSecondary, marginTop: 1, textAlign: 'center' }}>
                {s.label}
              </Text>
            </View>
          ))}
        </View>
      )}
    </Glass>
  )
}
