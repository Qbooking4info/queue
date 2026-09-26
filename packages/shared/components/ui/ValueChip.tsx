import { useEffect, useRef } from 'react'
import { View, Text, Animated, StyleProp, ViewStyle } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../../contexts/ThemeContext'
import { useReducedMotion } from '../../hooks/useReducedMotion'

// The two greens the "you're nearly up" flash fades between. Both are dark enough
// that white text measures >= 6.6:1 against them, so the number stays readable at
// every point in the fade -- not just at the endpoints. A single green pulsing its
// own opacity can't promise that: it spends the middle of every cycle blended with
// whatever is behind it. Deliberately a true green, not accent/successSubtle, which
// are derived from the teal/blue accent and would read as "same as everything else"
// on a teal hero -- the exact opposite of an alert.
const ALERT_GREEN_BASE = '#0B6B37'
const ALERT_GREEN_PEAK = '#063F21'

// The raised near-opaque pill that carries a key number. This is the one
// element in the glass language that is NOT translucent -- it lifts off the
// frosted panel precisely because it's solid, so the number stays the most
// legible thing on the card. Keep it for real values only.
export function ValueChip({
  value, unit, tone, tall = true, pulse = false, style,
}: {
  value: string | number
  unit?: string
  /** Override the numeral colour (e.g. t.danger for an emergency wait). Ignored while pulsing. */
  tone?: string
  /** false gives the shorter inline variant used inside list rows. */
  tall?: boolean
  /** Flash green to alert the patient that they're nearly up. */
  pulse?: boolean
  style?: StyleProp<ViewStyle>
}) {
  const { theme: t, chipElevation } = useTheme()
  const reduceMotion = useReducedMotion()
  const flash = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (!pulse || reduceMotion) { flash.setValue(0); return }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(flash, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(flash, { toValue: 0, duration: 650, useNativeDriver: true }),
      ])
    )
    anim.start()
    return () => anim.stop()
  }, [pulse, reduceMotion, flash])

  // While pulsing the chip is green, so the text has to be white regardless of theme
  // or any caller-supplied tone -- t.textPrimary is near-black in light mode and would
  // sit at ~1.3:1 on the green.
  const textColor = pulse ? '#FFFFFF' : (tone || t.textPrimary)

  return (
    <View style={[{
      backgroundColor: pulse ? ALERT_GREEN_BASE : t.chip,
      borderWidth: 1,
      borderColor: pulse ? 'rgba(255,255,255,0.45)' : t.chipBorder,
      borderRadius: 16,
      paddingVertical: tall ? 14 : 8,
      paddingHorizontal: tall ? 9 : 12,
      minWidth: 46, alignItems: 'center', flexShrink: 0,
    }, chipElevation, style]}>
      {/* Reduced motion still gets the green (ALERT_GREEN_BASE above) -- the alert is
          carried by colour, and only the animation is dropped. Rounded to match the
          parent rather than clipped with overflow:'hidden', which on Android would
          also clip chipElevation's shadow. */}
      {pulse && !reduceMotion && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            borderRadius: 16, backgroundColor: ALERT_GREEN_PEAK, opacity: flash,
          }}
        />
      )}
      <Text style={{
        fontSize: 18, fontWeight: '700', letterSpacing: -0.3,
        color: textColor,
      }}>{value}</Text>
      {!!unit && (
        // textSecondary, not textFaint: the decorative tone measured 1.84:1 on a
        // dark chip and 3.93:1 on a light one, so the label under the number was
        // the least readable text on the card. Bumped from 9px to 11px and given
        // real weight, since at 9px it read as a smudge even where contrast was fine.
        <Text style={{
          fontSize: 11, fontWeight: '600', marginTop: 3,
          color: pulse ? 'rgba(255,255,255,0.92)' : t.textSecondary,
        }}>{unit}</Text>
      )}
    </View>
  )
}

// The circular raised icon holder used in list rows and headers.
export function IconOrb({
  name, size = 40, color, bg, style,
}: {
  name: React.ComponentProps<typeof Ionicons>['name']
  size?: number
  color?: string
  bg?: string
  style?: StyleProp<ViewStyle>
}) {
  const { theme: t, chipElevation } = useTheme()
  return (
    <View style={[{
      width: size, height: size, borderRadius: size / 2, flexShrink: 0,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: bg || t.chip,
      borderWidth: 1, borderColor: t.chipBorder,
    }, chipElevation, style]}>
      <Ionicons name={name} size={size * 0.45} color={color || t.textPrimary} />
    </View>
  )
}
