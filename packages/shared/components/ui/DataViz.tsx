import { useState, useEffect, useRef } from 'react'
import { View, Text, TouchableOpacity, Animated, StyleProp, ViewStyle, LayoutChangeEvent } from 'react-native'
import { useTheme } from '../../contexts/ThemeContext'
import { useReducedMotion } from '../../hooks/useReducedMotion'

// Small data visuals for the glass language: a line spark, a tick bar and a
// countdown ring.
//
// All three are built from plain Views rather than SVG on purpose. react-native-svg
// is not a dependency of this monorepo, and adding it means a native module, which
// means every app needs a fresh native build before anything renders. The existing
// bar chart in the doctor app's analytics screen takes the same View-based approach,
// so this stays consistent with what's already here.
//
// Unlike the mockup these came from, every one of them takes real data instead of a
// fixed decorative path -- a chart that ignores its input is worse than no chart.

/**
 * A line chart drawn as a chain of thin rotated Views, one per segment between
 * consecutive points. Width is unknown until layout, so the line renders on the
 * second pass once onLayout reports it.
 */
export function Spark({
  data, color, height = 34, thickness = 2, style,
}: {
  /** Two or more values. Scaled to their own min/max, so any unit works. */
  data: number[]
  color?: string
  height?: number
  thickness?: number
  style?: StyleProp<ViewStyle>
}) {
  const { theme: t } = useTheme()
  const [width, setWidth] = useState(0)
  const stroke = color || t.ink

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width
    if (w > 0 && Math.abs(w - width) > 1) setWidth(w)
  }

  // Flat or single-point data has no line to draw; render the baseline instead so
  // the card keeps its shape rather than collapsing.
  const usable = data.filter(v => Number.isFinite(v))
  const min = Math.min(...usable)
  const max = Math.max(...usable)
  const span = max - min

  return (
    <View onLayout={onLayout} style={[{ height, justifyContent: 'center' }, style]}>
      {width > 0 && usable.length >= 2 && span > 0 ? (
        usable.slice(0, -1).map((v, i) => {
          const stepX = width / (usable.length - 1)
          // Inset by half the thickness top and bottom so the line never clips.
          const pad = thickness / 2
          const h = height - thickness
          const x1 = i * stepX
          const y1 = pad + (1 - (v - min) / span) * h
          const x2 = (i + 1) * stepX
          const y2 = pad + (1 - (usable[i + 1] - min) / span) * h
          const dx = x2 - x1
          const dy = y2 - y1
          const len = Math.sqrt(dx * dx + dy * dy)
          const angle = (Math.atan2(dy, dx) * 180) / Math.PI
          return (
            <View
              key={i}
              style={{
                position: 'absolute',
                left: x1,
                top: y1 - thickness / 2,
                width: len,
                height: thickness,
                borderRadius: thickness,
                backgroundColor: stroke,
                // Rotate about the segment's left edge so it pivots from (x1,y1).
                transform: [
                  { translateX: -len / 2 }, { rotate: `${angle}deg` }, { translateX: len / 2 },
                ],
              }}
            />
          )
        })
      ) : (
        <View style={{ height: thickness, borderRadius: thickness, backgroundColor: stroke, opacity: 0.35 }} />
      )}
    </View>
  )
}

/**
 * A row of tick bars. Heights come from the data, and one tick can be lifted to
 * full height to mark the current value.
 */
export function Ticks({
  data, highlight, height = 34, color, style,
}: {
  data: number[]
  /** Index to draw at full height in the strong ink colour. */
  highlight?: number
  height?: number
  color?: string
  style?: StyleProp<ViewStyle>
}) {
  const { theme: t } = useTheme()
  const max = Math.max(...data, 1)
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 3, height }, style]}>
      {data.map((v, i) => {
        const on = i === highlight
        return (
          <View
            key={i}
            style={{
              width: 2, borderRadius: 2, flexShrink: 1,
              height: on ? height : Math.max(4, (v / max) * (height - 8)),
              backgroundColor: on ? (color || t.ink) : t.tick,
            }}
          />
        )
      })}
    </View>
  )
}

/**
 * A segmented countdown ring: `segments` ticks arranged in a circle, with the
 * leading `fraction` of them lit.
 *
 * Segmented rather than a swept arc because a true arc needs either SVG or the
 * rotating-half-circle clipping trick, and that trick's geometry is easy to get
 * subtly wrong and impossible to verify without a device. Positioning N ticks by
 * rotation is exact by construction, and reads clearly as a dial.
 */
export function Ring({
  fraction, size = 52, segments = 24, color, children, style,
}: {
  /** 0..1. Clamped. */
  fraction: number
  size?: number
  segments?: number
  color?: string
  children?: React.ReactNode
  style?: StyleProp<ViewStyle>
}) {
  const { theme: t } = useTheme()
  const f = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0))
  const lit = Math.round(f * segments)
  const tickH = Math.max(5, size * 0.16)
  const tickW = 2

  return (
    <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
      {Array.from({ length: segments }).map((_, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            width: tickW, height: tickH, borderRadius: tickW,
            backgroundColor: i < lit ? (color || t.accent) : t.tick,
            // Rotate around the centre, then push out to the rim. Starts at 12
            // o'clock and fills clockwise.
            transform: [
              { rotate: `${(i / segments) * 360}deg` },
              { translateY: -(size / 2 - tickH / 2 - 1) },
            ],
          }}
        />
      ))}
      <View style={{ alignItems: 'center', justifyContent: 'center' }}>{children}</View>
    </View>
  )
}

/**
 * The glass-language pill that carries arbitrary short text -- "Triage 2",
 * "On duty", "Scheduled". StatusBadge covers the fixed booking statuses from its
 * own label map and can't render free text, so this is its flexible sibling.
 */
export function Pill({
  label, tone = 'statusNeutral', dot, style,
}: {
  label: string
  /** Any status tone on the theme, e.g. 'statusOpen' | 'statusBusy' | 'statusCancelled'. */
  tone?: 'statusOpen' | 'statusBusy' | 'statusVirtual' | 'statusCancelled' | 'statusProgress' | 'statusNeutral'
  dot?: boolean
  style?: StyleProp<ViewStyle>
}) {
  const { theme: t } = useTheme()
  const s = (t as any)[tone] ?? t.statusNeutral
  return (
    <View style={[{
      flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
      paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999,
      borderWidth: 1, backgroundColor: s.bg, borderColor: s.border,
    }, style]}>
      {dot && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: s.text }} />}
      <Text style={{ fontSize: 11, fontWeight: '600', color: s.text }}>{label}</Text>
    </View>
  )
}

/**
 * A 270-degree segmented arc with a figure in the middle — "14 of 20 seen".
 *
 * Segmented for the same reason as Ring: a swept arc needs SVG or a clipping trick
 * whose geometry can't be verified without a device, whereas placing N ticks by
 * rotation is exact by construction. The 90-degree gap sits at the bottom, so the
 * arc reads as a dial rather than a ring.
 */
export function Gauge({
  fraction, caption, sub, size = 118, segments = 32, color, style,
}: {
  /** 0..1. Clamped. */
  fraction: number
  caption: string | number
  sub?: string
  size?: number
  segments?: number
  color?: string
  style?: StyleProp<ViewStyle>
}) {
  const { theme: t } = useTheme()
  const f = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0))
  const lit = Math.round(f * segments)
  const tickH = Math.max(6, size * 0.11)
  const tickW = 3
  const SWEEP = 270
  const START = -135

  return (
    <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
      {Array.from({ length: segments }).map((_, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            width: tickW, height: tickH, borderRadius: tickW,
            backgroundColor: i < lit ? (color || t.accent) : t.tick,
            transform: [
              { rotate: `${START + (i / (segments - 1)) * SWEEP}deg` },
              { translateY: -(size / 2 - tickH / 2 - 1) },
            ],
          }}
        />
      ))}
      <View style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 28, fontWeight: '700', letterSpacing: -0.8, color: t.textPrimary }}>
          {caption}
        </Text>
        {!!sub && <Text style={{ fontSize: 10, color: t.textSecondary, marginTop: 1 }}>{sub}</Text>}
      </View>
    </View>
  )
}

/** The glass pill-group used to switch between a few views. Controlled. */
export function Segmented({
  options, value, onChange, style,
}: {
  options: string[]
  value: number
  onChange: (index: number) => void
  style?: StyleProp<ViewStyle>
}) {
  const { theme: t, chipElevation } = useTheme()
  return (
    <View style={[{
      flexDirection: 'row', gap: 4, padding: 4, borderRadius: 999,
      backgroundColor: t.cardBg, borderWidth: 1, borderColor: t.cardBorder,
    }, style]}>
      {options.map((o, i) => {
        const on = i === value
        return (
          <TouchableOpacity
            key={o}
            onPress={() => onChange(i)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={[{
              flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 999,
              backgroundColor: on ? t.chip : 'transparent',
              borderWidth: 1, borderColor: on ? t.chipBorder : 'transparent',
            }, on ? chipElevation : null]}
          >
            <Text style={{ fontSize: 12.5, fontWeight: '600', color: on ? t.textPrimary : t.textSecondary }}>
              {o}
            </Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

/**
 * A dot that breathes, for "this is live and needs attention" — an emergency in the
 * queue, a call in progress. Honours reduce-motion by holding steady at full opacity,
 * so the signal survives without the movement.
 */
export function PulseDot({ color, size = 7, style }: { color?: string; size?: number; style?: StyleProp<ViewStyle> }) {
  const { theme: t } = useTheme()
  const reduceMotion = useReducedMotion()
  const pulse = useRef(new Animated.Value(1)).current

  useEffect(() => {
    if (reduceMotion) { pulse.setValue(1); return }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.25, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    )
    anim.start()
    return () => anim.stop()
  }, [reduceMotion, pulse])

  return (
    <Animated.View
      style={[{
        width: size, height: size, borderRadius: size / 2,
        backgroundColor: color || t.danger,
        opacity: reduceMotion ? 1 : pulse,
      }, style]}
    />
  )
}

/**
 * Wraps a tile in a flashing outline to demand attention, without touching the
 * tile's own colours or hiding its content — an overlay ring pulses rather than
 * the children fading, so the thing being pointed at stays readable throughout.
 *
 * Under reduce-motion the ring is drawn steadily instead of pulsing: the call to
 * action survives, the movement doesn't.
 */
export function Flashing({
  active, color, radius = 18, children, style,
}: {
  active: boolean
  color?: string
  /** Match the wrapped tile's borderRadius or the ring will not sit on its edge. */
  radius?: number
  children?: React.ReactNode
  style?: StyleProp<ViewStyle>
}) {
  const { theme: t } = useTheme()
  const reduceMotion = useReducedMotion()
  const glow = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (!active || reduceMotion) { glow.setValue(active ? 1 : 0); return }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 620, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 620, useNativeDriver: true }),
      ])
    )
    anim.start()
    return () => anim.stop()
  }, [active, reduceMotion, glow])

  return (
    <View style={[{ position: 'relative' }, style]}>
      {children}
      {active && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute', top: -3, left: -3, right: -3, bottom: -3,
            borderRadius: radius + 3, borderWidth: 2,
            borderColor: color || t.accent,
            opacity: glow,
          }}
        />
      )}
    </View>
  )
}
