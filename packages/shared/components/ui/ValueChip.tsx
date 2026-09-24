import { View, Text, StyleProp, ViewStyle } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../../contexts/ThemeContext'

// The raised near-opaque pill that carries a key number. This is the one
// element in the glass language that is NOT translucent -- it lifts off the
// frosted panel precisely because it's solid, so the number stays the most
// legible thing on the card. Keep it for real values only.
export function ValueChip({
  value, unit, tone, tall = true, style,
}: {
  value: string | number
  unit?: string
  /** Override the numeral colour (e.g. t.danger for an emergency wait). */
  tone?: string
  /** false gives the shorter inline variant used inside list rows. */
  tall?: boolean
  style?: StyleProp<ViewStyle>
}) {
  const { theme: t, chipElevation } = useTheme()
  return (
    <View style={[{
      backgroundColor: t.chip,
      borderWidth: 1, borderColor: t.chipBorder,
      borderRadius: 16,
      paddingVertical: tall ? 14 : 8,
      paddingHorizontal: tall ? 9 : 12,
      minWidth: 46, alignItems: 'center', flexShrink: 0,
    }, chipElevation, style]}>
      <Text style={{
        fontSize: 17, fontWeight: '600', letterSpacing: -0.3,
        color: tone || t.textPrimary,
      }}>{value}</Text>
      {!!unit && (
        <Text style={{ fontSize: 9, color: t.textFaint, marginTop: 2 }}>{unit}</Text>
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
