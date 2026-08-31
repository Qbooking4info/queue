import { View, Text } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../../contexts/ThemeContext'

export function Stars({ rating }: { rating: number }) {
  const { theme: t } = useTheme()
  const full = Math.floor(rating)
  const frac = rating - full
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {Array.from({ length: 5 }, (_, i) => (
        <Ionicons
          key={i}
          name={i < full || (i === full && frac >= 0.5) ? 'star' : 'star-outline'}
          size={11}
          color={i < full || (i === full && frac >= 0.5) ? t.starColor : t.inputBorder}
        />
      ))}
      <Text style={{ color: t.textMuted, marginLeft: 4, fontSize: 11 }}>{rating}</Text>
    </View>
  )
}
