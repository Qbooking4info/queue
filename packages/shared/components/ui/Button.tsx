import { TouchableOpacity, Text, ActivityIndicator, ViewStyle, TextStyle } from 'react-native'
import { useTheme } from '../../contexts/ThemeContext'

interface Props {
  label: string
  onPress?: () => void
  variant?: 'primary' | 'outline' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  disabled?: boolean
  style?: ViewStyle
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
export function Button({ label, onPress, variant = 'primary', size = 'md', loading, disabled, style }: Props) {
  const { theme: t } = useTheme()
  const isDisabled = disabled || loading

  const containerStyles: ViewStyle = {
    borderRadius: size === 'lg' ? t.radius.lg : size === 'sm' ? t.radius.sm : t.radius.md,
    paddingVertical: size === 'lg' ? t.spacing.lg : size === 'sm' ? t.spacing.sm : t.spacing.md,
    paddingHorizontal: size === 'lg' ? t.spacing.xxl : size === 'sm' ? t.spacing.md : t.spacing.xl,
    alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: t.spacing.sm,
    opacity: isDisabled ? 0.5 : 1,
    ...(variant === 'primary' && { backgroundColor: t.accent }),
    ...(variant === 'outline' && { backgroundColor: 'transparent', borderWidth: 1, borderColor: t.cardBorder }),
    ...(variant === 'ghost'   && { backgroundColor: 'transparent' }),
  }

  const textStyle: TextStyle = {
    fontSize: size === 'lg' ? t.font.lg : size === 'sm' ? t.font.sm : t.font.md,
    fontWeight: '700',
    color: variant === 'primary' ? '#fff' : t.textSecondary,
  }

  return (
    <TouchableOpacity onPress={onPress} disabled={isDisabled} style={[containerStyles, style]} activeOpacity={0.75}>
      {loading && <ActivityIndicator size="small" color={variant === 'primary' ? '#fff' : t.accent} />}
      <Text style={textStyle}>{label}</Text>
    </TouchableOpacity>
  )
}
