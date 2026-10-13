// v3.1 shared components (docs/handoff "Shared components"). Every app builds its
// screens from these so the teal header, tiles, rows and controls stay identical.
import { useEffect, useRef, useState } from 'react'
import { View, TouchableOpacity, Pressable, StyleSheet, AccessibilityInfo, type StyleProp, type ViewStyle } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../../contexts/ThemeContext'
import { haptics } from '../../lib/haptics'

type IconName = React.ComponentProps<typeof Ionicons>['name']

/** The header gradient: primary -> primaryDeep in light, deep -> surface in dark. */
export function useHeaderColors(): [string, string] {
  const { theme: t } = useTheme()
  return t.id === 'forest' ? ['#134E4A', '#0F2326'] : ['#0F766E', '#134E4A']
}

// ── Header ────────────────────────────────────────────────────────────────────

export function Header({
  title, subtitle, onBack, backIcon = 'chevron-back', right, children, extraBottom = 0,
}: {
  title?: string
  subtitle?: string
  onBack?: () => void
  backIcon?: IconName
  right?: React.ReactNode
  children?: React.ReactNode
  /** Extra bottom padding, for content that overlaps the header from below. */
  extraBottom?: number
}) {
  const insets = useSafeAreaInsets()
  const colors = useHeaderColors()
  return (
    <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
      style={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 18 + extraBottom, gap: 14 }}>
      {(onBack || title || right) && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {onBack && (
            <TouchableOpacity onPress={() => { haptics.tap(); onBack() }} accessibilityRole="button"
              accessibilityLabel={backIcon === 'close' ? 'Close' : 'Back'} style={hs.round}>
              <Ionicons name={backIcon} size={20} color="#FFFFFF" />
            </TouchableOpacity>
          )}
          <View style={{ flex: 1 }}>
            {!!title && <Text style={hs.title} accessibilityRole="header" numberOfLines={1}>{title}</Text>}
            {!!subtitle && <Text style={hs.subtitle} numberOfLines={1}>{subtitle}</Text>}
          </View>
          {right}
        </View>
      )}
      {children}
    </LinearGradient>
  )
}

/**
 * The handoff's overlapping-card look (header padding 64, first card pulled up 46)
 * with a header that stays put: place this first inside the ScrollView content and
 * the first card overlaps a strip of the header's bottom colour, which scrolls away
 * with it. The Header gradient runs top to bottom, so the seam is invisible.
 */
export function HeaderTail({ height = 44 }: { height?: number }) {
  const [, bottom] = useHeaderColors()
  return <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height, backgroundColor: bottom }} />
}

/** Round translucent button for the header's right slot. */
export function HeaderIconButton({ icon, label, onPress, dot }: { icon: IconName; label: string; onPress: () => void; dot?: boolean }) {
  return (
    <TouchableOpacity onPress={() => { haptics.tap(); onPress() }} accessibilityRole="button" accessibilityLabel={label} style={hs.round}>
      <Ionicons name={icon} size={20} color="#FFFFFF" />
      {dot && <View style={hs.dot} />}
    </TouchableOpacity>
  )
}

const hs = StyleSheet.create({
  round:    { width: 48, height: 48, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  title:    { color: '#FFFFFF', fontSize: 20, fontWeight: '800' },
  subtitle: { color: '#CCFBF1', fontSize: 13, marginTop: 1 },
  dot:      { position: 'absolute', top: 10, right: 11, width: 9, height: 9, borderRadius: 9, backgroundColor: '#F59E0B', borderWidth: 2, borderColor: '#0F766E' },
})

// ── Card / section ────────────────────────────────────────────────────────────

export function Card({ children, style, onPress, accessibilityLabel }: {
  children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; accessibilityLabel?: string
}) {
  const { theme: t } = useTheme()
  const base = { backgroundColor: t.cardBg, borderColor: t.cardBorder, borderWidth: 1, borderRadius: 14, padding: 14 }
  if (!onPress) return <View style={[base, style]}>{children}</View>
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={() => { haptics.tap(); onPress() }}
      accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={[base, style]}>
      {children}
    </TouchableOpacity>
  )
}

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const { theme: t } = useTheme()
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 32 }}>
      <Text style={{ fontSize: 16, fontWeight: '700', color: t.textPrimary }} accessibilityRole="header">{title}</Text>
      {action && onAction && (
        <TouchableOpacity onPress={onAction} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button">
          <Text style={{ fontSize: 14, fontWeight: '700', color: t.accent }}>{action}</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

// ── ServiceTile ───────────────────────────────────────────────────────────────

export function ServiceTile({ icon, label, sublabel, sublabelTone = 'muted', tileColor, onPress }: {
  icon: IconName; label: string; sublabel?: string
  sublabelTone?: 'muted' | 'success' | 'warning'
  tileColor?: string; onPress: () => void
}) {
  const { theme: t } = useTheme()
  const tone = sublabelTone === 'success' ? (t.id === 'forest' ? '#4ADE80' : '#15803D')
    : sublabelTone === 'warning' ? (t.id === 'forest' ? '#FBBF24' : '#B45309') : t.textMuted
  const iconOn = t.id === 'forest' ? '#081416' : '#FFFFFF'
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={() => { haptics.tap(); onPress() }}
      accessibilityRole="button" accessibilityLabel={sublabel ? `${label}, ${sublabel}` : label}
      style={{ flex: 1, minHeight: 108, backgroundColor: t.cardBg, borderColor: t.cardBorder, borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 }}>
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: tileColor ?? t.accent, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={20} color={iconOn} />
      </View>
      <View>
        <Text style={{ fontSize: 15, fontWeight: '700', color: t.textPrimary }}>{label}</Text>
        {!!sublabel && <Text style={{ fontSize: 12, fontWeight: sublabelTone === 'muted' ? '400' : '600', color: tone, marginTop: 1 }}>{sublabel}</Text>}
      </View>
    </TouchableOpacity>
  )
}

// ── ListRow ───────────────────────────────────────────────────────────────────

export function ListRow({ icon, initials, title, subtitle, trailing, onPress, danger, last }: {
  icon?: IconName; initials?: string; title: string; subtitle?: string
  trailing?: React.ReactNode; onPress?: () => void; danger?: boolean; last?: boolean
}) {
  const { theme: t } = useTheme()
  const content = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 8,
      borderBottomWidth: last ? 0 : 1, borderBottomColor: t.cardBorder }}>
      {(icon || initials) && (
        <View style={{ width: 40, height: 40, borderRadius: initials ? 99 : 12, backgroundColor: danger ? t.dangerBg : t.accentBg, alignItems: 'center', justifyContent: 'center' }}>
          {icon ? <Ionicons name={icon} size={20} color={danger ? t.danger : t.accent} />
                : <Text style={{ fontWeight: '800', color: t.accent }}>{initials}</Text>}
        </View>
      )}
      <View style={{ flex: 1, minWidth: 96 }}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: danger ? t.danger : t.textPrimary }}>{title}</Text>
        {!!subtitle && <Text style={{ fontSize: 13, color: t.textMuted, marginTop: 1 }} numberOfLines={2}>{subtitle}</Text>}
      </View>
      <View style={{ flexShrink: 1, maxWidth: '55%', alignItems: 'flex-end' }}>
        {trailing ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={t.textMuted} /> : null)}
      </View>
    </View>
  )
  if (!onPress) return content
  return (
    <TouchableOpacity activeOpacity={0.7} onPress={() => { haptics.tap(); onPress() }} accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}>{content}</TouchableOpacity>
  )
}

// ── SegmentedControl ──────────────────────────────────────────────────────────

export function SegmentedControl<T extends string>({ options, value, onChange, onDark, danger }: {
  options: { value: T; label: string }[]; value: T; onChange: (v: T) => void
  /** Rendered on the teal header: translucent track, white selection. */
  onDark?: boolean
  /** Danger variant: the selected Emergency segment goes red. */
  danger?: T
}) {
  const { theme: t } = useTheme()
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', borderRadius: 99, padding: 4,
      backgroundColor: onDark ? 'rgba(255,255,255,0.14)' : t.accentBg }}>
      {options.map(o => {
        const sel = o.value === value
        const isDanger = sel && danger === o.value
        const bg = !sel ? 'transparent' : isDanger ? '#B91C1C' : onDark ? '#FFFFFF' : t.cardBg
        const color = !sel ? (onDark ? '#FFFFFF' : t.textMuted) : isDanger ? '#FFFFFF' : onDark ? '#0F766E' : t.accent
        return (
          <TouchableOpacity key={o.value} onPress={() => { haptics.tap(); onChange(o.value) }}
            accessibilityRole="tab" accessibilityState={{ selected: sel }}
            style={{ flex: 1, minHeight: 40, borderRadius: 99, alignItems: 'center', justifyContent: 'center', backgroundColor: bg }}>
            <Text style={{ fontSize: 14, fontWeight: sel ? '700' : '500', color }}>{o.label}</Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

// ── KpiCard ───────────────────────────────────────────────────────────────────

/** Label, value and optional trend (hospital Today, doctor Today, web dashboard). */
export function KpiCard({ icon, label, value, trend, trendTone = 'muted', highlight, onPress, disabled }: {
  icon?: IconName; label: string; value: string | number; trend?: string
  trendTone?: 'up' | 'down' | 'muted'; highlight?: boolean; onPress?: () => void; disabled?: boolean
}) {
  const { theme: t } = useTheme()
  const tone = trendTone === 'up' ? t.statusSuccess.text : trendTone === 'down' ? t.danger : t.textMuted
  const body = (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <Text style={{ fontSize: 12, fontWeight: '600', color: highlight ? t.accent : t.textMuted, flex: 1, paddingRight: 6 }} numberOfLines={2}>{label}</Text>
        {icon && (
          <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: t.accentBg, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={icon} size={16} color={t.accent} />
          </View>
        )}
      </View>
      <Text style={{ fontSize: 26, fontWeight: '800', color: highlight ? t.accent : t.textPrimary, letterSpacing: -0.5 }}>{value}</Text>
      {!!trend && <Text style={{ fontSize: 11, fontWeight: '600', color: tone, marginTop: 4 }}>{trend}</Text>}
    </>
  )
  const style: ViewStyle = {
    flex: 1, padding: 16, borderRadius: 16, borderWidth: 1, opacity: disabled ? 0.5 : 1,
    backgroundColor: highlight ? t.accentBg : t.cardBg, borderColor: highlight ? t.accentBorder : t.cardBorder,
  }
  if (!onPress) return <View style={style}>{body}</View>
  return (
    <TouchableOpacity disabled={disabled} onPress={() => { haptics.tap(); onPress() }} accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}${trend ? ', ' + trend : ''}`} style={style}>
      {body}
    </TouchableOpacity>
  )
}

// ── Primary / ghost button (48 px) ────────────────────────────────────────────

export function PrimaryButton({ label, onPress, variant = 'primary', disabled, loading, height = 52, icon }: {
  label: string; onPress: () => void; variant?: 'primary' | 'ghost' | 'danger'
  disabled?: boolean; loading?: boolean; height?: number; icon?: IconName
}) {
  const { theme: t } = useTheme()
  const onPrimary = t.id === 'forest' ? '#081416' : '#FFFFFF'
  const bg = variant === 'primary' ? t.accent : variant === 'danger' ? '#B91C1C' : 'transparent'
  const fg = variant === 'ghost' ? t.accent : variant === 'danger' ? '#FFFFFF' : onPrimary
  const off = disabled || loading
  return (
    <TouchableOpacity disabled={off} onPress={() => { haptics.tap(); onPress() }}
      accessibilityRole="button" accessibilityState={{ disabled: !!off, busy: !!loading }}
      style={{ minHeight: height, paddingVertical: 10, borderRadius: 13, backgroundColor: off && variant !== 'ghost' ? t.cardBorder : bg,
        borderWidth: variant === 'ghost' ? 1.5 : 0, borderColor: t.accent,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 18 }}>
      {icon && <Ionicons name={icon} size={18} color={off && variant !== 'ghost' ? t.textMuted : fg} />}
      <Text style={{ fontSize: 16, fontWeight: '700', color: off && variant !== 'ghost' ? t.textMuted : fg }}>
        {loading ? 'Please wait…' : label}
      </Text>
    </TouchableOpacity>
  )
}

// ── HoldButton ────────────────────────────────────────────────────────────────

/**
 * Press and hold for `holdMs` to fire. Releasing early cancels. Screen-reader and
 * keyboard users get a tap-then-confirm fallback (the `fallbackLabel` link), since
 * a timed hold is not operable for everyone.
 */
export function HoldButton({ label, sublabel, onComplete, holdMs = 2000, size = 220, color = '#B91C1C', ring = '#7F1D1D', track = '#FECACA', fallbackLabel = "Can't hold? Tap here to send instead" }: {
  label: string; sublabel?: string; onComplete: () => void; holdMs?: number
  size?: number; color?: string; ring?: string; track?: string; fallbackLabel?: string
}) {
  const [progress, setProgress] = useState(0)
  const [confirming, setConfirming] = useState(false)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const started = useRef(0)
  const done = useRef(false)

  useEffect(() => () => { if (timer.current) clearInterval(timer.current) }, [])

  function start() {
    if (done.current) return
    haptics.tap()
    started.current = Date.now()
    timer.current = setInterval(() => {
      const p = Math.min(1, (Date.now() - started.current) / holdMs)
      setProgress(p)
      if (p >= 1) {
        if (timer.current) clearInterval(timer.current)
        done.current = true
        AccessibilityInfo.announceForAccessibility?.('Sent')
        onComplete()
      }
    }, 50)
  }
  function stop() {
    if (done.current) return
    if (timer.current) clearInterval(timer.current)
    setProgress(0)
  }

  // A ring made of two half-discs is overkill here; a filled arc segment count reads fine.
  const segments = 40
  const lit = Math.round(progress * segments)
  return (
    <View style={{ alignItems: 'center', gap: 14 }}>
      <Pressable onPressIn={start} onPressOut={stop} accessibilityRole="button"
        accessibilityLabel={`${label}. Press and hold for ${holdMs / 1000} seconds`}
        style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        {Array.from({ length: segments }).map((_, i) => {
          const a = (i / segments) * 2 * Math.PI - Math.PI / 2
          const r = size / 2 - 7
          return (
            <View key={i} style={{ position: 'absolute', width: 10, height: 10, borderRadius: 5,
              left: size / 2 + r * Math.cos(a) - 5, top: size / 2 + r * Math.sin(a) - 5,
              backgroundColor: i < lit ? ring : track }} />
          )
        })}
        <View style={{ width: size - 36, height: size - 36, borderRadius: 999, backgroundColor: color, alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          <Text style={{ fontSize: 40, fontWeight: '800', color: '#FFFFFF', letterSpacing: 2 }}>{label}</Text>
          <Text style={{ fontSize: 14, fontWeight: '600', color: '#FECACA' }}>{progress > 0 ? 'Keep holding…' : (sublabel ?? 'Press and hold')}</Text>
        </View>
      </Pressable>
      {!confirming ? (
        <TouchableOpacity onPress={() => setConfirming(true)} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text style={{ color: ring, fontSize: 14, fontWeight: '700', textDecorationLine: 'underline' }}>{fallbackLabel}</Text>
        </TouchableOpacity>
      ) : (
        <View style={{ flexDirection: 'row', gap: 8, alignSelf: 'stretch' }}>
          <TouchableOpacity onPress={() => setConfirming(false)} accessibilityRole="button"
            style={{ flex: 1, height: 48, borderRadius: 13, borderWidth: 1, borderColor: track, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: ring, fontWeight: '700', fontSize: 15 }}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { done.current = true; setConfirming(false); onComplete() }} accessibilityRole="button"
            style={{ flex: 2, height: 48, borderRadius: 13, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 15 }}>Yes, send {label}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  )
}

// ── Empty / error state ───────────────────────────────────────────────────────

export function EmptyState({ icon, title, body, action, onAction }: {
  icon: IconName; title: string; body?: string; action?: string; onAction?: () => void
}) {
  const { theme: t } = useTheme()
  return (
    <View style={{ alignItems: 'center', paddingVertical: 40, paddingHorizontal: 12, gap: 10 }}>
      <View style={{ width: 72, height: 72, borderRadius: 99, backgroundColor: t.accentBg, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={32} color={t.accent} />
      </View>
      <Text style={{ fontSize: 17, fontWeight: '700', color: t.textPrimary, textAlign: 'center' }}>{title}</Text>
      {!!body && <Text style={{ fontSize: 14, color: t.textMuted, textAlign: 'center', lineHeight: 20 }}>{body}</Text>}
      {action && onAction && <View style={{ marginTop: 6, alignSelf: 'stretch' }}><PrimaryButton label={action} onPress={onAction} variant="ghost" /></View>}
    </View>
  )
}
