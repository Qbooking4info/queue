import { View, Text, StyleSheet } from 'react-native'

interface Props { initials: string; bg?: string; size?: number }

// A full circle with white initials, matching the mockups' MDAvatar exactly --
// `bg` is always a solid, fully-saturated color (see adapters.ts's AVATAR_BG),
// so white text reads clearly against any of them regardless of theme. No
// border and no theme-accent tinting: those made sense when every avatar
// shared one dark, muted bg palette, but fight a bg color that's now deliberately
// distinct per hospital/doctor.
export function Avatar({ initials, bg = '#006D3E', size = 42 }: Props) {
  return (
    <View style={[styles.container, {
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: bg,
    }]}>
      <Text style={[styles.text, { fontSize: size * 0.31, color: '#FFFFFF' }]}>{initials}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  text: { fontWeight: '700', letterSpacing: -0.2 },
})
