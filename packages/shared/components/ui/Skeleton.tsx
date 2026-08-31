import { useEffect, useRef } from 'react'
import { Animated, View, StyleSheet, ViewStyle } from 'react-native'
import { useTheme } from '../../contexts/ThemeContext'

interface SkeletonProps {
  width?: number | string
  height?: number
  borderRadius?: number
  style?: ViewStyle
}

export function Skeleton({ width = '100%', height = 16, borderRadius = 8, style }: SkeletonProps) {
  const { theme: t } = useTheme()
  const opacity = useRef(new Animated.Value(0.3)).current

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.8, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 700, useNativeDriver: true }),
      ])
    )
    anim.start()
    return () => anim.stop()
  }, [])

  return (
    <Animated.View
      style={[{ width: width as any, height, borderRadius, backgroundColor: t.cardBorder, opacity }, style]}
    />
  )
}

export function SkeletonCard({ style }: { style?: ViewStyle }) {
  const { theme: t } = useTheme()
  return (
    <View style={[sk.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder }, style]}>
      <View style={sk.cardLeft}>
        <Skeleton width={42} height={42} borderRadius={12} />
      </View>
      <View style={sk.cardBody}>
        <Skeleton width="60%" height={14} borderRadius={7} />
        <View style={{ height: 8 }} />
        <Skeleton width="40%" height={11} borderRadius={6} />
      </View>
    </View>
  )
}

export function SkeletonRow({ style }: { style?: ViewStyle }) {
  const { theme: t } = useTheme()
  return (
    <View style={[sk.row, { borderBottomColor: t.cardBorder }, style]}>
      <View style={sk.cardLeft}>
        <Skeleton width={40} height={40} borderRadius={12} />
      </View>
      <View style={sk.cardBody}>
        <Skeleton width="55%" height={13} borderRadius={6} />
        <View style={{ height: 7 }} />
        <Skeleton width="35%" height={10} borderRadius={5} />
      </View>
    </View>
  )
}

const sk = StyleSheet.create({
  card:     { flexDirection: 'row', alignItems: 'center', borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 10 },
  cardLeft: { marginRight: 12 },
  cardBody: { flex: 1 },
  row:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, gap: 12 },
})
