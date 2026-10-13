import { TouchableOpacity, ActivityIndicator, ViewStyle, TextStyle } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../../contexts/ThemeContext'
import { haptics } from '../../lib/haptics'

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
  // itself. Most of the icon-having buttons this component's adoption sweep had to
  // skip were this exact shape: one icon, one label, nothing fancier.
  icon?: keyof typeof Ionicons.glyphMap
  iconPosition?: 'left' | 'right'
}

// Had zero consumers when this was found -- it imported a hardcoded `dark` palette
// from lib/theme.ts, an earlier, orphaned token file with its own dark/light objects
// that nothing else in the app ever switches into, and referenced keys (`borderMed`,
// `textSub`) that don't exist on the real theme every screen actually uses. That made
// it permanently dark and disconnected from the app's real forest/clinical toggle --
// exactly the "reads fine in the one theme nobody checked" bug this session kept
// finding elsewhere. Fixed to use the live ThemeContext instead, and since nothing
// referenced this component's exact pixel values yet, its radius/font now come
// straight from the theme's own scale rather than a second, competing set of numbers.
export function Button({
  label, onPress, variant = 'primary', size = 'md', loading, disabled, style, icon, iconPosition = 'left',
}: Props) {
  const { theme: t } = useTheme()
  const isDisabled = disabled || loading

  // forest's accent (#0F766E) is bright enough that white text on it reads worse than
  // near-black -- six screens had already independently discovered this and hand-wrote
  // the same `t.id === 'forest' ? '#061208' : '#fff'` check. Centralizing it here so
  // every future primary button gets it for free instead of rediscovering it a seventh
  // time.
  const onPrimary = t.id === 'forest' ? '#081416' : '#FFFFFF'

  // v3.1 sizing, shared with PrimaryButton: 48 px touch target (52 for lg), 13 px radius.
  const containerStyles: ViewStyle = {
    borderRadius: size === 'sm' ? t.radius.sm : 13,
    minHeight: size === 'lg' ? 52 : size === 'sm' ? 36 : 48,
    paddingVertical: size === 'sm' ? t.spacing.xs + 2 : t.spacing.sm + 2,
    paddingHorizontal: size === 'lg' ? t.spacing.xxl : size === 'sm' ? t.spacing.md : t.spacing.xl,
    alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: t.spacing.sm,
    opacity: isDisabled ? 0.5 : 1,
    ...(variant === 'primary' && { backgroundColor: t.accent }),
    ...(variant === 'outline' && { backgroundColor: 'transparent', borderWidth: 1, borderColor: t.cardBorder }),
    ...(variant === 'ghost'   && { backgroundColor: 'transparent' }),
    // Matches the bordered/tinted destructive button several screens (sign out, delete
    // account) had already hand-rolled from dangerSubtle/dangerStrong -- not a new look.
    ...(variant === 'danger'  && { backgroundColor: t.dangerSubtle, borderWidth: 1, borderColor: t.dangerStrong }),
    // Matches the "Approve"/positive-action buttons several queue screens had
    // already hand-rolled from accentDark at these same opacities.
    ...(variant === 'success' && { backgroundColor: t.successSubtle, borderWidth: 1, borderColor: t.successBorder }),
    // Same shape again for neutral/forward-progress actions ("Check In", "Vitals") --
    // matches what FrontDeskQueueScreen already hand-rolled from infoSubtle/infoBorder.
    ...(variant === 'info'    && { backgroundColor: t.infoSubtle, borderWidth: 1, borderColor: t.infoBorder }),
  }

  const textStyle: TextStyle = {
    fontSize: size === 'lg' ? t.font.lg : size === 'sm' ? t.font.base : 15,
    fontWeight: '700',
    color: variant === 'primary' ? onPrimary
      : variant === 'danger'  ? t.danger
      : variant === 'success' ? t.accentDark
      : variant === 'info'    ? t.info
      : t.textSecondary,
  }
  const iconSize = size === 'lg' ? 18 : size === 'sm' ? 13 : 15

  // Loading already has its own signal (the spinner) -- showing the icon alongside it
  // too is just clutter, so it drops out while loading rather than stacking with it.
  const iconEl = icon && !loading
    ? <Ionicons name={icon} size={iconSize} color={textStyle.color} />
    : null

  return (
    <TouchableOpacity onPress={onPress ? () => { haptics.tap(); onPress() } : undefined} disabled={isDisabled}
      accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      style={[containerStyles, style]} activeOpacity={0.75}>
      {loading && <ActivityIndicator size="small" color={textStyle.color} />}
      {iconPosition === 'left' && iconEl}
      <Text style={textStyle}>{label}</Text>
      {iconPosition === 'right' && iconEl}
    </TouchableOpacity>
  )
}
