import { View, StyleSheet } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { useTheme } from '../../contexts/ThemeContext'

interface Props { initials: string; bg?: string; size?: number }

// `bg` is accepted for compatibility but ignored: the old per-name palette was all dark
// greens tuned for the Forest theme. v3.1 avatars use the theme tint so they read in both modes.
export function Avatar({ initials, size = 42 }: Props) {
  const { theme: t } = useTheme()
  return (
    <View style={[styles.container, {
      width: size, height: size, borderRadius: size * 0.28,
      backgroundColor: t.accentBg, borderColor: t.accentBorder,
    }]}>
      <Text style={[styles.text, { fontSize: size * 0.28, color: t.accent }]}>{initials}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, flexShrink: 0 },
  text: { fontWeight: '700', letterSpacing: -0.2 },
})
