/**
 * The v4 patient-app component kit, built to the measurements in the design
 * handoff (queue-patient-handoff/patient/light/*.html) rather than to a
 * description of it. Where a number here looks arbitrary -- 56px rows, a 36px
 * icon chip, 11.5px uppercase labels, a 60% journey rail -- it was read off the
 * handoff markup, so change it in the handoff first.
 *
 * Why a new kit instead of restyling components/ui/v3.tsx: v3.tsx is on screen
 * in the doctor, hospital and ambulance apps too, and those are redesigned
 * later. This kit renders from `theme.q` (the handoff's own token names), so the
 * same components will serve those apps when their turn comes.
 *
 * House rules this kit enforces so screens cannot forget them:
 *  - One status pill per row, flat tint, no ring.
 *  - Hairlines between rows; no card inside a card.
 *  - Every number a patient compares (queue position, money, times, IDs) is
 *    tabular. A queue number that shifts width as it ticks reads as a glitch.
 *  - Press feedback is scale 0.97 and nothing else. Rows a patient taps 40+
 *    times in a sitting get no transition at all.
 */
import { forwardRef, type ReactNode } from 'react'
import {
  View, Pressable, ScrollView, StyleSheet, Platform, ActivityIndicator,
  type ViewStyle, type TextStyle, type StyleProp,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Text, TextInput } from '../ui/Typography'
import { useTheme } from '../../contexts/ThemeContext'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// ── type ──────────────────────────────────────────────────────────────────────

/**
 * The handoff asks for JetBrains Mono. It is not in the bundle yet
 * (@expo-google-fonts/jetbrains-mono is not installed), so this falls back to
 * each platform's own mono face. The shapes differ but the one property that
 * matters -- fixed advance width, so a changing digit does not move its
 * neighbours -- holds on all three.
 */
export const MONO = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  web: '"JetBrains Mono",ui-monospace,"Roboto Mono",monospace',
  default: 'monospace',
}) as string

/** Tabular figures. Applied to every compared number in this kit. */
export const NUMS = { fontVariant: ['tabular-nums'] as TextStyle['fontVariant'] }

/** Monospaced, tabular. For IDs, reference codes, clock times and counters. */
export function Mono({ children, size = 13, color, weight = '600', style }: {
  children: ReactNode
  size?: number
  color?: string
  weight?: TextStyle['fontWeight']
  style?: StyleProp<TextStyle>
}) {
  const { theme: t } = useTheme()
  return (
    <Text style={[{ fontFamily: MONO, fontSize: size, color: color ?? t.q.ink, fontWeight: weight }, NUMS, style]}>
      {children}
    </Text>
  )
}

// ── structure ─────────────────────────────────────────────────────────────────

export function Screen({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { theme: t } = useTheme()
  return <View style={[{ flex: 1, backgroundColor: t.q.bg }, style]}>{children}</View>
}

/**
 * The two header registers in the handoff.
 *  - large: a 28px/800 page title on the canvas (Home, Appointments, Profile).
 *  - compact: a 44px back target, a centred 16px title with a mono subtitle
 *    under it (every pushed screen).
 */
export function AppBar({ title, sub, onBack, right, large, children }: {
  title?: string
  sub?: string
  onBack?: () => void
  right?: ReactNode
  large?: boolean
  children?: ReactNode
}) {
  const { theme: t } = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <View style={{ backgroundColor: t.q.bg, paddingTop: insets.top }}>
      {large ? (
        <View>
          {/* A large header on a pushed screen still needs its way back, which
              the title row has no room for. */}
          {!!onBack && (
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingTop: 6 }}>
              <IconBtn name="chevron-back" label="Back" onPress={onBack} />
            </View>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 20, paddingTop: onBack ? 2 : 8, paddingBottom: 14, gap: 12 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 28, lineHeight: 33, fontWeight: '800', letterSpacing: -0.7, color: t.q.ink }}>
                {title}
              </Text>
              {/* The sub line is where the count, or the filter in force, is
                  said -- dropping it on the large variant lost real information. */}
              {!!sub && (
                <Text numberOfLines={2} style={{ fontSize: 13, lineHeight: 18, color: t.q.ink60, marginTop: 4 }}>
                  {sub}
                </Text>
              )}
            </View>
            {right}
          </View>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingVertical: 6, gap: 4 }}>
          {onBack ? <IconBtn name="chevron-back" label="Back" onPress={onBack} /> : <View style={{ width: 44 }} />}
          <View style={{ flex: 1, minWidth: 0, alignItems: 'center' }}>
            {!!title && (
              <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: '700', letterSpacing: -0.16, color: t.q.ink, maxWidth: 230 }}>
                {title}
              </Text>
            )}
            {!!sub && <Mono size={10.5} color={t.q.ink60} weight="400">{sub}</Mono>}
          </View>
          {right ?? <View style={{ width: 44 }} />}
        </View>
      )}
      {children}
    </View>
  )
}

/** A 44px round tap target. The handoff's minimum, and the minimum anywhere. */
export function IconBtn({ name, label, onPress, color, size = 21, badge }: {
  name: React.ComponentProps<typeof Ionicons>['name']
  label: string
  onPress?: () => void
  color?: string
  size?: number
  badge?: boolean
}) {
  const { theme: t } = useTheme()
  return (
    <Pressable
      onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => [
        { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
        pressed && { transform: [{ scale: t.brand.motion.pressScale }] },
      ]}>
      <Ionicons name={name} size={size} color={color ?? t.q.ink} />
      {badge && (
        <View style={{ position: 'absolute', top: 10, right: 10, width: 8, height: 8, borderRadius: 4, backgroundColor: t.q.redFill, borderWidth: 1.5, borderColor: t.q.bg }} />
      )}
    </Pressable>
  )
}

/**
 * The handoff's card: a white surface, 16px radius, one hairline border and a
 * shadow so slight it reads as a lifted edge rather than a float. Rows go
 * inside it edge to edge, which is why it clips its children.
 */
export function Card({ children, style, pad }: { children: ReactNode; style?: StyleProp<ViewStyle>; pad?: boolean }) {
  const { theme: t } = useTheme()
  return (
    <View style={[
      {
        marginHorizontal: 16, backgroundColor: t.q.surface, borderWidth: 1, borderColor: t.q.line,
        borderRadius: 16, overflow: 'hidden',
      },
      // The handoff's shadow is a light-mode device; on the dark palette the
      // same shadow is invisible and the elevation only muddies the surface.
      !t.isDark && { shadowColor: '#0B1114', shadowOpacity: 0.05, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
      pad && { padding: 14 },
      style,
    ]}>
      {children}
    </View>
  )
}

/** The small uppercase label at the top of a card. */
export function CardLabel({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  const { theme: t } = useTheme()
  return (
    <Text style={[{ fontSize: 11.5, fontWeight: '700', letterSpacing: 0.58, textTransform: 'uppercase', color: t.q.ink60 }, style]}>
      {children}
    </Text>
  )
}

/** The uppercase rule between card groups on a scrolling page. */
export function SectionHead({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const { theme: t } = useTheme()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 8 }}>
      <Text style={{ flex: 1, fontSize: 12, fontWeight: '700', letterSpacing: 0.72, textTransform: 'uppercase', color: t.q.ink60 }}>
        {title}
      </Text>
      {!!action && (
        <Pressable onPress={onAction} accessibilityRole="button" hitSlop={10}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: t.q.primary }}>{action}</Text>
        </Pressable>
      )}
    </View>
  )
}

/** The hairline between rows. Indented to the text, not the card edge. */
export function Hair({ inset = 14 }: { inset?: number }) {
  const { theme: t } = useTheme()
  return <View style={{ height: 1, backgroundColor: t.q.line, marginLeft: inset }} />
}

// ── rows ──────────────────────────────────────────────────────────────────────

export type PillTone = 'teal' | 'green' | 'amber' | 'red' | 'neutral'

/**
 * One status pill per row. `solid` is the attention register the handoff uses
 * for the two states that need the patient to act ("Pay to hold",
 * "Emergency"); everything else is a flat tint. There is no bordered variant
 * on purpose.
 */
export function Pill({ label, tone = 'neutral', solid, onTint }: {
  label: string
  tone?: PillTone
  solid?: boolean
  /** Set when the pill sits on a tinted row. A teal pill's own ground IS the
   *  tint, so without this the pill disappears into the row and only the word
   *  is left -- visible in the handoff's own Appointments screen. */
  onTint?: boolean
}) {
  const { theme: t } = useTheme()
  const q = t.q
  const flat: Record<PillTone, [string, string]> = {
    teal: [q.sel, q.primary],
    green: [q.greenBg, q.green],
    amber: [q.amberBg, q.amber],
    red: [q.redBg, q.red],
    neutral: [q.muted, q.ink70],
  }
  // On a solid fill the label has to be the opposite ink, not the tone colour.
  const filled: Record<PillTone, [string, string]> = {
    teal: [q.primary, q.onPrimary],
    green: [q.greenFill, t.isDark ? '#04231A' : '#043325'],
    amber: [q.amberFill, '#1C1204'],
    red: [q.redFill, '#FFFFFF'],
    neutral: [q.ink70, q.surface],
  }
  let [bg, fg] = solid ? filled[tone] : flat[tone]
  if (onTint && !solid && tone === 'teal') bg = q.surface
  return (
    <View style={{ backgroundColor: bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, flexShrink: 0 }}>
      <Text numberOfLines={1} style={{ fontSize: 10.5, fontWeight: '700', letterSpacing: 0.42, textTransform: 'uppercase', color: fg }}>
        {label}
      </Text>
    </View>
  )
}

/** The 36px tinted icon chip at the head of a row. */
export function RowIcon({ name, tone }: { name: React.ComponentProps<typeof Ionicons>['name']; tone?: PillTone }) {
  const { theme: t } = useTheme()
  const q = t.q
  const map: Record<PillTone, [string, string]> = {
    teal: [q.sel, q.primary],
    green: [q.greenBg, q.green],
    amber: [q.amberBg, q.amber],
    red: [q.redBg, q.red],
    neutral: [q.muted, q.ink70],
  }
  const [bg, fg] = map[tone ?? 'teal']
  return (
    <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={name} size={18} color={fg} />
    </View>
  )
}

/**
 * The list row, used for everything from a hospital to a lab result. 56px is
 * the handoff's minimum; `compact` (46px) is the queue list, where the number
 * carries the row and a shorter rhythm lets more of the queue fit on screen.
 */
export function Row({
  icon, iconTone, leading, number, title, sub, pill, pillTone, pillSolid, right,
  chevron, onPress, tint, compact, titleColor, subColor, dim,
}: {
  icon?: React.ComponentProps<typeof Ionicons>['name']
  iconTone?: PillTone
  leading?: ReactNode
  number?: string | number
  title: string
  sub?: string | null
  pill?: string
  pillTone?: PillTone
  pillSolid?: boolean
  right?: ReactNode
  chevron?: boolean
  onPress?: () => void
  tint?: boolean
  compact?: boolean
  titleColor?: string
  subColor?: string
  /** A row that has already happened -- greyed, not hidden. */
  dim?: boolean
}) {
  const { theme: t } = useTheme()
  const body = (
    <>
      {number != null && (
        <Text style={[{ width: 30, flexShrink: 0, fontSize: 18, fontWeight: '700', letterSpacing: -0.36, color: dim ? t.q.ink60 : t.q.ink }, NUMS]}>
          {number}
        </Text>
      )}
      {!!icon && <RowIcon name={icon} tone={iconTone} />}
      {leading}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text numberOfLines={1} style={{ fontSize: 14.5, fontWeight: '600', letterSpacing: -0.14, color: titleColor ?? (dim ? t.q.ink60 : t.q.ink) }}>
          {title}
        </Text>
        {!!sub && <Text numberOfLines={1} style={{ fontSize: 12.5, lineHeight: 16, color: subColor ?? t.q.ink60 }}>{sub}</Text>}
      </View>
      {!!pill && <Pill label={pill} tone={pillTone} solid={pillSolid} onTint={tint} />}
      {right}
      {chevron && <Ionicons name="chevron-forward" size={18} color={t.q.ink60} />}
    </>
  )
  const style: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: compact ? 46 : 56,
    backgroundColor: tint ? t.q.sel : 'transparent',
  }
  if (!onPress) return <View style={style}>{body}</View>
  return (
    <Pressable
      onPress={onPress} accessibilityRole="button"
      style={({ pressed }) => [style, pressed && { backgroundColor: tint ? t.q.sel : t.q.muted }]}>
      {body}
    </Pressable>
  )
}

/** A label/value line inside a card -- "Hospital · Lagos Island General". */
export function DetailRow({ label, value, mono, last }: {
  label: string
  value: ReactNode
  mono?: boolean
  last?: boolean
}) {
  const { theme: t } = useTheme()
  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, minHeight: 44, paddingVertical: 8 }}>
        <Text style={{ width: 92, flexShrink: 0, fontSize: 12.5, color: t.q.ink60 }}>{label}</Text>
        {typeof value === 'string'
          ? mono
            ? <Mono size={13} style={{ flex: 1 }}>{value}</Mono>
            : <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: t.q.ink }}>{value}</Text>
          : <View style={{ flex: 1 }}>{value}</View>}
      </View>
      {!last && <Hair />}
    </>
  )
}

// ── figures ───────────────────────────────────────────────────────────────────

/** The oversized number a patient reads across a waiting room. */
export function BigFigure({ label, value, color }: { label: string; value: string | number; color?: string }) {
  const { theme: t } = useTheme()
  return (
    <View>
      <Text style={{ fontSize: 12, fontWeight: '600', color: t.q.ink60 }}>{label}</Text>
      <Text style={[{ fontSize: 72, lineHeight: 76, fontWeight: '800', letterSpacing: -2.9, color: color ?? t.q.ink }, NUMS]}>
        {value}
      </Text>
    </View>
  )
}

/** One cell of the divided three-up figure strip. */
export function Stat({ label, value, unit, note, last, tone, onPress }: {
  label: string
  value: string | number
  unit?: string
  note?: string
  last?: boolean
  /** Colours the figure when it is the one that needs acting on. Used sparingly:
   *  a strip where every number is coloured says nothing. */
  tone?: PillTone
  onPress?: () => void
}) {
  const { theme: t } = useTheme()
  const q = t.q
  const ink = tone === 'red' ? q.red : tone === 'amber' ? q.amber
    : tone === 'green' ? q.green : tone === 'teal' ? q.primary : q.ink
  const Box: any = onPress ? Pressable : View
  return (
    <Box
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={onPress ? `${label}: ${value}${note ? '. ' + note : ''}` : undefined}
      style={{ flex: 1, minWidth: 0, padding: 12, borderRightWidth: last ? 0 : 1, borderRightColor: t.q.line }}>
      <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: '600', color: t.q.ink60 }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 4 }}>
        <Text style={[{ fontSize: 22, fontWeight: '700', letterSpacing: -0.44, color: ink }, NUMS]}>{value}</Text>
        {!!unit && <Text style={{ fontSize: 11, fontWeight: '600', color: t.q.ink60, marginLeft: 3 }}>{unit}</Text>}
      </View>
      {!!note && <Text style={{ fontSize: 11, lineHeight: 14, color: t.q.ink60, marginTop: 3 }}>{note}</Text>}
    </Box>
  )
}

/**
 * The working day as one bar: when it opened, where "now" is, when it closes.
 *
 * Staff screens open on a question the clock answers -- how much of the day is
 * left to get through the queue -- and a bar answers it faster than two times
 * and some arithmetic. Outside opening hours the fill pins to the end rather
 * than running past it, because a 140%-full bar reads as a rendering fault.
 */
export function DayBar({ opensAt, closesAt, now = new Date(), label = 'Today', right }: {
  /** "08:00" */
  opensAt: string
  /** "18:00" */
  closesAt: string
  now?: Date
  label?: string
  right?: ReactNode
}) {
  const { theme: t } = useTheme()
  const mins = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number)
    return (h || 0) * 60 + (m || 0)
  }
  const open = mins(opensAt)
  const close = mins(closesAt)
  const nowMins = now.getHours() * 60 + now.getMinutes()
  const span = Math.max(1, close - open)
  const pct = Math.max(0, Math.min(100, ((nowMins - open) / span) * 100))
  const clock = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

  return (
    <View style={{ marginHorizontal: 16, marginBottom: 14, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: t.q.surface, borderWidth: 1, borderColor: t.q.line, borderRadius: 16 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <CardLabel>{label}</CardLabel>
        {right ?? <Text style={[{ fontSize: 12, fontWeight: '700', color: t.q.ink }, NUMS]}>Now {clock}</Text>}
      </View>
      <View
        accessibilityLabel={`Open ${opensAt} to ${closesAt}, now ${clock}`}
        style={{ height: 6, borderRadius: 3, backgroundColor: t.q.muted, marginTop: 10, overflow: 'hidden' }}>
        <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, borderRadius: 3, backgroundColor: t.q.primary }} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 7 }}>
        <Mono size={10.5} color={t.q.ink60} weight="400">{opensAt}</Mono>
        <Mono size={10.5} color={t.q.ink60} weight="400">{closesAt}</Mono>
      </View>
    </View>
  )
}

export function StatStrip({ children }: { children: ReactNode }) {
  return <Card><View style={{ flexDirection: 'row' }}>{children}</View></Card>
}

// ── the journey ───────────────────────────────────────────────────────────────

/**
 * "Your visit" -- the one component that answers the question every waiting
 * patient actually has, which is not "what number am I" but "what happens
 * next". The rail is drawn between the first and last dot centres (hence the
 * half-step inset), and the live step is a larger dot with a halo so it is
 * findable without reading the labels.
 *
 * `blockingIndex` marks a step the patient is stuck at rather than progressing
 * through -- an unpaid booking sits at "Paid" and goes no further. It is drawn
 * in amber, because painting it teal would say the step is done.
 */
export function Journey({ steps, activeIndex, blockingIndex, label = 'Your visit', flat }: {
  steps: string[]
  activeIndex: number
  blockingIndex?: number
  /** "Your visit" to the patient; "This visit" on the doctor's consult screen. */
  label?: string
  /** Drops the card chrome so the bar can sit INSIDE a card -- the operator's
   *  call list puts one per call, and a card inside a card is out of vocabulary. */
  flat?: boolean
}) {
  const { theme: t } = useTheme()
  const n = steps.length
  const inset = n > 1 ? 50 / n : 0 // half a step, as a percentage of the row
  const span = n > 1 ? (Math.max(0, Math.min(activeIndex, n - 1)) / (n - 1)) * 100 : 0
  const blocked = blockingIndex != null
  return (
    <View style={flat
      ? { paddingHorizontal: 14, paddingVertical: 12 }
      : { marginHorizontal: 16, marginBottom: 14, padding: 12, backgroundColor: t.q.surface, borderWidth: 1, borderColor: t.q.line, borderRadius: 16 }}>
      <CardLabel>{label}</CardLabel>
      <View style={{ flexDirection: 'row', marginTop: 12 }}>
        <View style={{ position: 'absolute', top: 5, left: `${inset}%`, right: `${inset}%`, height: 2, borderRadius: 1, backgroundColor: t.q.line }}>
          <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${span}%`, backgroundColor: blocked ? t.q.amberFill : t.q.primary }} />
        </View>
        {steps.map((s, i) => {
          const done = i < activeIndex
          const here = i === activeIndex
          const stop = i === blockingIndex
          const fill = stop ? t.q.amberFill : done || here ? t.q.primary : t.q.surface
          return (
            <View key={s} style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: 7 }}>
              <View style={[
                { width: 12, height: 12, borderRadius: 6, backgroundColor: fill },
                !done && !here && !stop && { borderWidth: 2, borderColor: t.q.line },
                (here || stop) && {
                  width: 16, height: 16, borderRadius: 8, marginTop: -2,
                  // The halo. A ring drawn as a border would eat into the dot.
                  shadowColor: stop ? t.q.amberFill : t.q.primary,
                  shadowOpacity: 0.35, shadowRadius: 4, shadowOffset: { width: 0, height: 0 },
                  elevation: 3,
                },
              ]} />
              <Text numberOfLines={2} style={{ fontSize: 10.5, lineHeight: 12, fontWeight: here || stop ? '700' : '600', color: here || stop ? t.q.ink : t.q.ink60, textAlign: 'center' }}>
                {s}
              </Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}

// ── controls ──────────────────────────────────────────────────────────────────

export type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

export function Btn({ label, onPress, variant = 'primary', icon, loading, disabled, grow, small, style }: {
  label: string
  onPress?: () => void
  variant?: BtnVariant
  icon?: React.ComponentProps<typeof Ionicons>['name']
  loading?: boolean
  disabled?: boolean
  grow?: boolean
  small?: boolean
  style?: StyleProp<ViewStyle>
}) {
  const { theme: t } = useTheme()
  const q = t.q
  const skin: Record<BtnVariant, { bg: string; fg: string; border?: string }> = {
    primary: { bg: q.primary, fg: q.onPrimary },
    secondary: { bg: 'transparent', fg: q.ink, border: q.line },
    ghost: { bg: 'transparent', fg: q.primary },
    danger: { bg: q.redFill, fg: '#FFFFFF' },
  }
  const s = skin[variant]
  const off = disabled || loading
  return (
    <Pressable
      onPress={off ? undefined : onPress} accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }} accessibilityLabel={label}
      style={({ pressed }) => [
        {
          minHeight: small ? 40 : 50,
          paddingHorizontal: 18,
          borderRadius: small ? 999 : 16,
          backgroundColor: s.bg,
          borderWidth: s.border ? 1.5 : 0,
          borderColor: s.border,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
          flexGrow: grow ? 1 : 0, flexShrink: 1,
          opacity: off ? 0.5 : 1,
        },
        pressed && !off && { transform: [{ scale: t.brand.motion.pressScale }] },
        style,
      ]}>
      {loading ? <ActivityIndicator color={s.fg} /> : (
        <>
          {!!icon && <Ionicons name={icon} size={small ? 17 : 18} color={s.fg} />}
          <Text numberOfLines={1} style={{ fontSize: small ? 14.5 : 15, fontWeight: variant === 'primary' ? '800' : '700', letterSpacing: -0.15, color: s.fg }}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  )
}

/** The pair of flat actions along the bottom edge of a card. */
export function CardActions({ children }: { children: ReactNode }) {
  const { theme: t } = useTheme()
  return <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: t.q.line }}>{children}</View>
}

export function CardAction({ label, onPress, first }: { label: string; onPress?: () => void; first?: boolean }) {
  const { theme: t } = useTheme()
  return (
    <Pressable
      onPress={onPress} accessibilityRole="button"
      style={({ pressed }) => [
        { flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center', borderLeftWidth: first ? 0 : 1, borderLeftColor: t.q.line },
        pressed && { backgroundColor: t.q.muted },
      ]}>
      <Text style={{ fontSize: 14, fontWeight: '700', color: t.q.primary }}>{label}</Text>
    </Pressable>
  )
}

/** The persistent action bar at the bottom of a task screen. */
export function BottomBar({ children, meta }: { children: ReactNode; meta?: ReactNode }) {
  const { theme: t } = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <View style={{
      backgroundColor: t.q.surface,
      borderTopWidth: 1,
      borderTopColor: t.q.line,
      paddingHorizontal: 14,
      paddingTop: 10,
      paddingBottom: 14 + insets.bottom,
      gap: 10,
    }}>
      {!!meta && <View style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', paddingHorizontal: 4 }}>{meta}</View>}
      <View style={{ flexDirection: 'row', gap: 10 }}>{children}</View>
    </View>
  )
}

/** Segmented control. White thumb on a recessed tray, as in the handoff. */
export function Seg<T extends string>({ options, value, onChange }: {
  options: { key: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  const { theme: t } = useTheme()
  return (
    <View style={{
      flexDirection: 'row', gap: 2, padding: 3, marginHorizontal: 16, marginTop: 10, marginBottom: 4, borderRadius: 12,
      // The tray must sit BELOW the thumb in both palettes. In light that is
      // muted under a white thumb; in dark, surface is darker than muted, so
      // reusing the light pairing made the selected segment look recessed --
      // the opposite of what it means.
      backgroundColor: t.isDark ? t.q.field : t.q.muted,
    }}>
      {options.map(o => {
        const on = o.key === value
        return (
          <Pressable
            key={o.key} onPress={() => onChange(o.key)} accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={[
              { flex: 1, minHeight: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: on ? (t.isDark ? t.q.elev : t.q.surface) : 'transparent' },
              on && !t.isDark && { shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
            ]}>
            <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '600', color: on ? t.q.ink : t.q.ink60 }}>{o.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

/** Filter chip. Scrolls horizontally in a row above a result list. */
export function Chip({ label, on, onPress, icon }: {
  label: string
  on?: boolean
  onPress?: () => void
  icon?: React.ComponentProps<typeof Ionicons>['name']
}) {
  const { theme: t } = useTheme()
  return (
    <Pressable
      onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!on }}
      style={({ pressed }) => [
        {
          minHeight: 36, paddingHorizontal: 14, borderRadius: 999,
          flexDirection: 'row', alignItems: 'center', gap: 6,
          backgroundColor: on ? t.q.sel : t.q.surface,
          borderWidth: 1, borderColor: on ? t.q.primary : t.q.line,
        },
        pressed && { transform: [{ scale: t.brand.motion.pressScale }] },
      ]}>
      {!!icon && <Ionicons name={icon} size={14} color={on ? t.q.primary : t.q.ink60} />}
      <Text style={{ fontSize: 13, fontWeight: '600', color: on ? t.q.primary : t.q.ink70 }}>{label}</Text>
    </Pressable>
  )
}

/** A tinted advisory. Never used for anything the patient must tap. */
export function Notice({ children, tone = 'amber', icon }: {
  children: ReactNode
  tone?: PillTone
  icon?: React.ComponentProps<typeof Ionicons>['name']
}) {
  const { theme: t } = useTheme()
  const q = t.q
  const map: Record<PillTone, [string, string]> = {
    teal: [q.sel, q.primary],
    green: [q.greenBg, q.green],
    amber: [q.amberBg, q.amber],
    red: [q.redBg, q.red],
    neutral: [q.muted, q.ink70],
  }
  const [bg, fg] = map[tone]
  const fallback = tone === 'red' ? 'alert-circle' : tone === 'green' ? 'checkmark-circle' : 'information-circle'
  return (
    <View accessibilityRole="alert" style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginHorizontal: 16, marginVertical: 8, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: bg, borderRadius: 14 }}>
      <Ionicons name={icon ?? (fallback as React.ComponentProps<typeof Ionicons>['name'])} size={18} color={fg} style={{ marginTop: 1 }} />
      <Text style={{ flex: 1, fontSize: 13, lineHeight: 18, color: t.q.ink }}>{children}</Text>
    </View>
  )
}

/** Search field. The handoff puts one at the top of Home and every find screen. */
export const SearchField = forwardRef<React.ComponentRef<typeof TextInput>, {
  value?: string
  onChangeText?: (v: string) => void
  placeholder: string
  onPress?: () => void
  autoFocus?: boolean
  onSubmitEditing?: () => void
}>(function SearchField({ value, onChangeText, placeholder, onPress, autoFocus, onSubmitEditing }, ref) {
  const { theme: t } = useTheme()
  const inner = (
    <View
      // When the whole field is a navigation target, the input inside must not
      // take focus -- otherwise the keyboard opens on a field that cannot search.
      pointerEvents={onPress ? 'none' : 'auto'}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14,
        height: 46, borderRadius: 14, backgroundColor: t.q.field, borderWidth: 1, borderColor: t.q.line,
      }}>
      <Ionicons name="search" size={18} color={t.q.ink60} />
      <TextInput
        ref={ref} value={value} onChangeText={onChangeText} placeholder={placeholder}
        placeholderTextColor={t.q.ink60} autoFocus={autoFocus} onSubmitEditing={onSubmitEditing}
        returnKeyType="search" accessibilityLabel={placeholder}
        style={{ flex: 1, minWidth: 0, fontSize: 15, color: t.q.ink, padding: 0 }}
      />
    </View>
  )
  if (!onPress) return <View style={{ marginHorizontal: 16, marginTop: 10, marginBottom: 6 }}>{inner}</View>
  return (
    <Pressable onPress={onPress} accessibilityRole="search" accessibilityLabel={placeholder} style={{ marginHorizontal: 16, marginTop: 10, marginBottom: 6 }}>
      {inner}
    </Pressable>
  )
})

/** Labelled text field. */
export function Field({ label, hint, error, ...input }: {
  label: string
  hint?: string
  error?: string | null
} & React.ComponentProps<typeof TextInput>) {
  const { theme: t } = useTheme()
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 12.5, fontWeight: '600', color: t.q.ink70 }}>{label}</Text>
      <TextInput
        placeholderTextColor={t.q.ink60} accessibilityLabel={label}
        {...input}
        style={[
          {
            minHeight: 48, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14,
            backgroundColor: t.q.field, borderWidth: 1, borderColor: error ? t.q.redFill : t.q.line,
            fontSize: 15, color: t.q.ink,
          },
          input.style,
        ]}
      />
      {!!(error ?? hint) && <Text style={{ fontSize: 12, color: error ? t.q.red : t.q.ink60 }}>{error ?? hint}</Text>}
    </View>
  )
}

/** A scroll body with the handoff's bottom breathing room. */
export function Body({ children, ...rest }: React.ComponentProps<typeof ScrollView>) {
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 28 }} {...rest}>
      {children}
    </ScrollView>
  )
}

/** Avatar-style initials disc. The handoff tints it per person, not per brand. */
export function Initials({ name, size = 44, tint }: { name?: string | null; size?: number; tint?: string }) {
  const { theme: t } = useTheme()
  const text = (name ?? '?').replace(/^Dr\.?\s*/i, '').split(/\s+/).map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?'
  const base = tint ?? '#475569'
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: `${base}22`, borderWidth: 1, borderColor: `${base}55`,
      alignItems: 'center', justifyContent: 'center',
    }}>
      <Text style={{ fontSize: Math.round(size * 0.34), fontWeight: '700', color: t.q.ink }}>{text}</Text>
    </View>
  )
}

/** Empty state. The handoff gives every list one, with the reason, not a shrug. */
export function Empty({ title, body, action, onAction, icon }: {
  title: string
  body?: string
  action?: string
  onAction?: () => void
  icon?: React.ComponentProps<typeof Ionicons>['name']
}) {
  const { theme: t } = useTheme()
  return (
    <View style={{ alignItems: 'center', paddingHorizontal: 32, paddingVertical: 36, gap: 8 }}>
      {!!icon && <Ionicons name={icon} size={28} color={t.q.ink60} style={{ marginBottom: 4 }} />}
      <Text style={{ fontSize: 15, fontWeight: '700', color: t.q.ink, textAlign: 'center' }}>{title}</Text>
      {!!body && <Text style={{ fontSize: 13, lineHeight: 19, color: t.q.ink60, textAlign: 'center' }}>{body}</Text>}
      {!!action && <Btn label={action} variant="secondary" small onPress={onAction} style={{ marginTop: 8 }} />}
    </View>
  )
}

export const qs = StyleSheet.create({
  /** Money, totals and anything a patient will check against a receipt. */
  naira: { fontFamily: MONO, fontWeight: '700' },
})
