import { View, Text, StyleSheet } from 'react-native'
import { useTheme } from '../../contexts/ThemeContext'

interface Props { initials: string; bg?: string; size?: number }

export function Avatar({ initials, bg = '#1A4A32', size = 42 }: Props) {
  const { theme: t } = useTheme()
  return (
    <View style={[styles.container, {
      width: size, height: size, borderRadius: size * 0.28,
      backgroundColor: bg, borderColor: t.accentBorder,
    }]}>
      <Text style={[styles.text, { fontSize: size * 0.28, color: t.accent }]}>{initials}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, flexShrink: 0 },
  text: { fontWeight: '700', letterSpacing: -0.2 },
})
