import { View, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Text } from '@queue/shared/components/ui/Typography'
import { useTheme } from '@queue/shared/contexts/ThemeContext'

/**
 * The two small primitives the dispatcher screens used from the glass kit
 * (IconOrb from ValueChip, Pill from DataViz), rebuilt against the v3.1
 * tokens. Kept local to the admin screens rather than added to
 * components/ui/v3.tsx: the v3.1 kit is the handoff's shared vocabulary and
 * these are not part of it.
 */

type IconName = React.ComponentProps<typeof Ionicons>['name']

/** Circular tinted icon badge, used as a list row's leading element. */
export function IconOrb({ name, size = 40, color }: { name: IconName; size?: number; color: string }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: `${color}1F`,
        borderWidth: 1,
        borderColor: `${color}4D`,
      }}
    >
      <Ionicons name={name} size={Math.round(size * 0.45)} color={color} />
    </View>
  )
}

export type PillTone = 'neutral' | 'info' | 'warn' | 'danger' | 'ok'

/** Small status chip. `dot` marks the urgent case so it reads without colour alone. */
export function TonePill({ label, tone = 'neutral', dot }: { label: string; tone?: PillTone; dot?: boolean }) {
  const { theme: t } = useTheme()
  const color =
    tone === 'danger' ? t.danger
    : tone === 'warn' ? t.statusBusy.text
    : tone === 'info' ? t.info
    : tone === 'ok'   ? t.accent
    : t.textMuted

  return (
    <View style={[s.pill, { backgroundColor: `${color}1A`, borderColor: `${color}40` }]}>
      {dot && <View style={[s.dot, { backgroundColor: color }]} />}
      <Text style={[s.label, { color }]}>{label}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 99,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  label: { fontSize: 11, fontWeight: '800' },
})
