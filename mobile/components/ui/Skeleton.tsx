import { useEffect, useRef } from 'react'
import { Animated, StyleSheet, View, ViewStyle } from 'react-native'
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
      style={[
        { width: width as any, height, borderRadius, backgroundColor: t.cardBorder, opacity },
        style,
      ]}
    />
  )
}

export function SkeletonCard({ style }: { style?: ViewStyle }) {
  const { theme: t } = useTheme()
  return (
    <View style={[skSt.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder }, style]}>
      <Skeleton width={44} height={44} borderRadius={13} />
      <View style={{ flex: 1, gap: 8 }}>
        <Skeleton width="60%" height={14} borderRadius={6} />
        <Skeleton width="40%" height={11} borderRadius={5} />
      </View>
      <Skeleton width={60} height={22} borderRadius={99} />
    </View>
  )
}

export function SkeletonRow({ style }: { style?: ViewStyle }) {
  return <Skeleton width="100%" height={16} borderRadius={6} style={style} />
}

const skSt = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 8,
  },
})
