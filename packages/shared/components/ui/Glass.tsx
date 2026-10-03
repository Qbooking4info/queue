import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native'
import { BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
import { useTheme } from '../../contexts/ThemeContext'

// ── The frosted panel ────────────────────────────────────────────────────────
//
// React Native has no backdrop-filter, so translucency alone isn't frosted
// glass -- what actually blurs the content behind is expo-blur's BlurView.
// Structure, deliberately three nested views:
//
//   outer  carries the shadow ONLY (no overflow/clip)
//   clip   carries borderRadius + overflow:'hidden' ONLY
//   inner  carries the translucent fill and the bright 1px edge
//
// The shadow and the corner-clip are split because combining `overflow:'hidden'`
// with a shadow on one View renders the shadow as a hard near-black rectangle
// on Android/web instead of a soft drop shadow -- the same bug that made the
// old HospitalCard look like it had a black border.
export function Glass({
  children, style, strong, radius = 22, pad = 16, blur = true,
}: {
  children?: React.ReactNode
  style?: StyleProp<ViewStyle>
  /** Use the more opaque fill -- for panels that sit over busy content. */
  strong?: boolean
  radius?: number
  pad?: number
  /** Set false for a plain translucent fill (cheaper; long lists). */
  blur?: boolean
}) {
  const { theme: t, shadow } = useTheme()
  const fill = strong ? t.glassStrong : t.glass

  return (
    <View style={[{ borderRadius: radius }, shadow, style]}>
      <View style={{ borderRadius: radius, overflow: 'hidden' }}>
        {blur && (
          <BlurView
            tint={t.blurTint}
            intensity={t.blurIntensity}
            style={StyleSheet.absoluteFill}
          />
        )}
        <View style={{
          backgroundColor: fill,
          borderWidth: 1,
          borderColor: t.glassBorder,
          borderRadius: radius,
          padding: pad,
        }}>
          {children}
        </View>
      </View>
    </View>
  )
}

// ── The gradient hero ────────────────────────────────────────────────────────
// The one vivid moment per screen. Everything on it reads `t.onHero`.
export function Hero({
  children, style, radius = 26, pad = 18,
}: {
  children?: React.ReactNode
  style?: StyleProp<ViewStyle>
  radius?: number
  pad?: number
}) {
  const { theme: t } = useTheme()
  return (
    <View style={[{
      borderRadius: radius,
      shadowColor: t.accent,
      shadowOffset: { width: 0, height: 14 },
      shadowOpacity: 0.35,
      shadowRadius: 24,
      elevation: 8,
    }, style]}>
      <LinearGradient
        colors={t.heroGradient as [string, string, ...string[]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ borderRadius: radius, padding: pad, overflow: 'hidden' }}
      >
        {children}
      </LinearGradient>
    </View>
  )
}

// A translucent pill for use ON a Hero (where the background is the gradient,
// not the canvas, so the normal glass tokens would be invisible).
export function HeroChip({ children, style }: { children?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{
      flexDirection: 'row', alignItems: 'center', gap: 5,
      paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
      backgroundColor: 'rgba(255,255,255,0.20)',
      borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)',
    }, style]}>
      {children}
    </View>
  )
}

// ── Screen background ────────────────────────────────────────────────────────
//
// An optional soft vertical wash for a screen that wants one. Most screens just
// use the flat `t.canvasBg`, which is opaque on purpose: a navigator keeps every
// visited screen mounted, so a transparent scene background renders all of them
// on top of each other.
//
// There are deliberately no decorative background blobs here. An earlier pass
// had them and they read as visual noise behind real content.
export function GlassBackground({ children, style }: { children?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { theme: t } = useTheme()
  return (
    <LinearGradient
      colors={t.screenGradient as [string, string, ...string[]]}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={[{ flex: 1 }, style]}
    >
      {children}
    </LinearGradient>
  )
}

// React Navigation paints its own opaque background between the backdrop and
// the screens, which would hide the gradient entirely. Screens supply their own
// colours, so the navigator itself can simply be transparent.
export const TRANSPARENT_NAV_THEME = {
  dark: false,
  colors: {
    primary: '#0B7F86',
    background: 'transparent',
    card: 'transparent',
    text: '#0E2A2E',
    border: 'transparent',
    notification: '#D2293A',
  },
  fonts: {
    regular: { fontFamily: 'System', fontWeight: '400' as const },
    medium: { fontFamily: 'System', fontWeight: '500' as const },
    bold: { fontFamily: 'System', fontWeight: '700' as const },
    heavy: { fontFamily: 'System', fontWeight: '800' as const },
  },
}
