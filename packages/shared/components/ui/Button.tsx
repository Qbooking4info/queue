import { TouchableOpacity, Text, ActivityIndicator, StyleSheet, ViewStyle, TextStyle } from 'react-native'
import { dark } from '../../lib/theme'

interface Props {
  label: string
  onPress?: () => void
  variant?: 'primary' | 'outline' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  disabled?: boolean
  style?: ViewStyle
}

export function Button({ label, onPress, variant = 'primary', size = 'md', loading, disabled, style }: Props) {
  const t = dark
  const isDisabled = disabled || loading

  const containerStyles: ViewStyle = {
    borderRadius: size === 'lg' ? 16 : size === 'sm' ? 10 : 12,
    paddingVertical: size === 'lg' ? 16 : size === 'sm' ? 8 : 12,
    paddingHorizontal: size === 'lg' ? 24 : size === 'sm' ? 12 : 18,
    alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8,
    opacity: isDisabled ? 0.5 : 1,
    ...(variant === 'primary' && { backgroundColor: t.accent }),
    ...(variant === 'outline' && { backgroundColor: 'transparent', borderWidth: 1, borderColor: t.borderMed }),
    ...(variant === 'ghost'   && { backgroundColor: 'transparent' }),
  }

  const textStyle: TextStyle = {
    fontSize: size === 'lg' ? 16 : size === 'sm' ? 12 : 14,
    fontWeight: '700',
    color: variant === 'primary' ? '#fff' : t.textSub,
  }

  return (
    <TouchableOpacity onPress={onPress} disabled={isDisabled} style={[containerStyles, style]} activeOpacity={0.75}>
      {loading && <ActivityIndicator size="small" color={variant === 'primary' ? '#fff' : t.accent} />}
      <Text style={textStyle}>{label}</Text>
    </TouchableOpacity>
  )
}
