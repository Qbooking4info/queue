import { View, Text, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useTheme } from '../../contexts/ThemeContext'

interface Props { initials: string; bg?: string; size?: number }

// A full circle with white initials over a gradient of the person's own colour,
// lifted off the glass by a bright ring and a coloured shadow.
//
// `bg` is a solid, fully-saturated colour (see adapters.ts's AVATAR_BG) chosen
// per-person, so white text reads clearly against any of them in every theme.
// The gradient is derived from it rather than passed in, so every call site
// that already passes a single colour keeps working unchanged.
export function Avatar({ initials, bg = '#0B7A47', size = 42 }: Props) {
  const { theme: t } = useTheme()
  const ringWidth = size >= 40 ? 2 : 1.5

  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2, flexShrink: 0,
      shadowColor: bg,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.4,
      shadowRadius: 12,
      elevation: 4,
    }}>
      <LinearGradient
        // Lighter at the top-left, solid at the bottom-right -- the sheen that
        // keeps a flat circle from looking like a plain colour swatch.
        colors={[bg + 'CC', bg] as [string, string]}
        start={{ x: 0.25, y: 0.1 }} end={{ x: 0.9, y: 1 }}
        style={{
          width: size, height: size, borderRadius: size / 2,
          alignItems: 'center', justifyContent: 'center',
          borderWidth: ringWidth,
          borderColor: t.mode === 'dark' ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.85)',
        }}
      >
        <Text style={[styles.text, { fontSize: size * 0.34 }]}>{initials}</Text>
      </LinearGradient>
    </View>
  )
}

const styles = StyleSheet.create({
  text: { fontWeight: '600', letterSpacing: 0.2, color: '#FFFFFF' },
})
