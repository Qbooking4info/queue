import { TouchableOpacity, Text, ActivityIndicator, ViewStyle, TextStyle } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useTheme } from '../../contexts/ThemeContext'

interface Props {
  label: string
  onPress?: () => void
  variant?: 'primary' | 'outline' | 'ghost' | 'danger' | 'success' | 'info'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  disabled?: boolean
  style?: ViewStyle
  // An Ionicons name, not a rendered icon -- Button owns sizing/color so the icon
  // always matches the label's, which every hand-rolled version had to duplicate
  // itself.
  icon?: keyof typeof Ionicons.glyphMap
  iconPosition?: 'left' | 'right'
}

// Glass-language button. The public API is unchanged from the MD3 version --
// same variants, sizes, props -- only the rendering differs:
//
//   primary  a real gradient fill with a coloured glow, the one saturated
//            control per screen
//   outline  a frosted pane rather than a hairline box
//   danger / success / info  keep their tinted-fill shape, restyled onto the
//            glass border tokens
//
// `primary` needs an extra nested View because LinearGradient can't also be the
// touch target without swallowing the shadow -- the shadow lives on the
// TouchableOpacity, the gradient clips inside it.
export function Button({
  label, onPress, variant = 'primary', size = 'md', loading, disabled, style, icon, iconPosition = 'left',
}: Props) {
  const { theme: t, shadow } = useTheme()
  const isDisabled = disabled || loading

  const padV = size === 'lg' ? t.spacing.lg : size === 'sm' ? t.spacing.sm : t.spacing.md
  const padH = size === 'lg' ? t.spacing.xxl : size === 'sm' ? t.spacing.md : t.spacing.xl

  const textStyle: TextStyle = {
    fontSize: size === 'lg' ? t.font.lg : size === 'sm' ? t.font.sm : t.font.md,
    fontWeight: '600',
    letterSpacing: 0.1,
    color: variant === 'primary' ? t.onBtn
      : variant === 'danger'  ? t.danger
      : variant === 'success' ? t.accentDark
      : variant === 'info'    ? t.info
      : t.textPrimary,
  }
  const iconSize = size === 'lg' ? 18 : size === 'sm' ? 13 : 15

  // Loading already has its own signal (the spinner) -- showing the icon alongside
  // it too is just clutter, so it drops out while loading rather than stacking.
  const iconEl = icon && !loading
    ? <Ionicons name={icon} size={iconSize} color={textStyle.color as string} />
    : null

  const inner = (
    <>
      {loading && <ActivityIndicator size="small" color={textStyle.color as string} />}
      {iconPosition === 'left' && iconEl}
      <Text style={textStyle}>{label}</Text>
      {iconPosition === 'right' && iconEl}
    </>
  )

  const rowStyle: ViewStyle = {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: t.spacing.sm, paddingVertical: padV, paddingHorizontal: padH,
  }

  if (variant === 'primary') {
    return (
      <TouchableOpacity
        onPress={onPress} disabled={isDisabled} activeOpacity={0.85}
        style={[{
          borderRadius: t.radius.pill,
          opacity: isDisabled ? 0.5 : 1,
          shadowColor: t.accent,
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.45,
          shadowRadius: 18,
          elevation: 6,
        }, style]}
      >
        <LinearGradient
          colors={t.btnGradient as [string, string, ...string[]]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={[rowStyle, { borderRadius: t.radius.pill, overflow: 'hidden' }]}
        >
          {inner}
        </LinearGradient>
      </TouchableOpacity>
    )
  }

  const variantFill: ViewStyle =
      variant === 'outline' ? { backgroundColor: t.glassStrong, borderWidth: 1, borderColor: t.glassBorder, ...shadow }
    : variant === 'ghost'   ? { backgroundColor: 'transparent' }
    : variant === 'danger'  ? { backgroundColor: t.dangerSubtle, borderWidth: 1, borderColor: t.dangerBorder }
    : variant === 'success' ? { backgroundColor: t.successSubtle, borderWidth: 1, borderColor: t.successBorder }
    : /* info */              { backgroundColor: t.infoSubtle, borderWidth: 1, borderColor: t.infoBorder }

  return (
    <TouchableOpacity
      onPress={onPress} disabled={isDisabled} activeOpacity={0.75}
      style={[rowStyle, {
        borderRadius: t.radius.pill,
        opacity: isDisabled ? 0.5 : 1,
      }, variantFill, style]}
    >
      {inner}
    </TouchableOpacity>
  )
}
