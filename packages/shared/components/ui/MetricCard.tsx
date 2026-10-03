import { View, Text, StyleProp, ViewStyle } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../../contexts/ThemeContext'
import { Glass } from './Glass'
import { ValueChip } from './ValueChip'

/**
 * A stat tile in the glass language: icon + title + subline across the top, a small
 * chart on the left and the raised ValueChip carrying the number on the right.
 *
 * Uses an Ionicon rather than the mockup's emoji: emoji render at the mercy of each
 * device's font, and the rest of this app is already consistently Ionicons.
 */
export function MetricCard({
  icon, title, sub, value, unit, chart, tone, iconColor, style,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name']
  title: string
  sub?: string
  value: string | number
  unit?: string
  /** A <Spark> or <Ticks>. Omitted is fine — the chip then takes the full width. */
  chart?: React.ReactNode
  /** Override the numeral colour, e.g. t.danger. */
  tone?: string
  iconColor?: string
  style?: StyleProp<ViewStyle>
}) {
  const { theme: t } = useTheme()
  return (
    <Glass radius={20} pad={13} style={[{ flex: 1, minWidth: 0 }, style]}>
      <View style={{ flexDirection: 'row', gap: 7, alignItems: 'flex-start', marginBottom: 8 }}>
        <Ionicons name={icon} size={15} color={iconColor || t.accent} style={{ marginTop: 1 }} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 12.5, fontWeight: '700', color: t.textPrimary }}>{title}</Text>
          {!!sub && <Text style={{ fontSize: 10.5, color: t.textSecondary, marginTop: 1 }}>{sub}</Text>}
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {!!chart && <View style={{ flex: 1, minWidth: 0 }}>{chart}</View>}
        <ValueChip value={value} unit={unit} tone={tone} />
      </View>
    </Glass>
  )
}
