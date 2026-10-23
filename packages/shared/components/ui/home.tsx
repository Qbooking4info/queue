import { View, TouchableOpacity, StyleSheet, type StyleProp, type ViewStyle } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Text } from './Typography'
import { useTheme } from '../../contexts/ThemeContext'
import { haptics } from '../../lib/haptics'

type IconName = React.ComponentProps<typeof Ionicons>['name']

/**
 * The home layout shared by all four apps.
 *
 * The teal gradient header is gone: it took the top fifth of every screen to
 * say the person's name. Instead the page sits on one flat surface and the
 * colour is spent in two places that carry meaning -- the status card at the
 * top, and the quick-action tiles.
 *
 * The status card is always the opposite of the page it sits on: pale mint on
 * the near-black dark theme, deep teal on the white light one. It is the one
 * bold element on the page, and matching the page would lose it.
 */

/** Hero palette, flipped against the page so the card always stands off it. */
function heroTones(dark: boolean) {
  return dark
    ? {
        fill:    ['#BDE9D8', '#A8E0CC'] as [string, string],
        ink:     '#0A2C26',
        soft:    '#2F6459',
        accent:  '#0D4F44',
        divider: 'rgba(10,44,38,0.18)',
        tileBg:  '#0C332C',
        tileInk: '#FFFFFF',
        tileSub: '#8FD9CE',
        dotOff:  'rgba(10,44,38,0.22)',
      }
    : {
        fill:    ['#15514B', '#0C2E2C'] as [string, string],
        ink:     '#FFFFFF',
        soft:    '#B9D9D3',
        accent:  '#6EE7D7',
        divider: 'rgba(255,255,255,0.16)',
        tileBg:  'rgba(0,0,0,0.26)',
        tileInk: '#FFFFFF',
        tileSub: '#8FD9CE',
        dotOff:  'rgba(255,255,255,0.3)',
      }
}

// ── top bar ───────────────────────────────────────────────────────────────────

export function TopBar({
  initials, avatar, eyebrow, title, onAvatarPress, right,
}: {
  /** Fallback when no `avatar` is given. */
  initials?: string
  /**
   * The signed-in person's picture. Pass <ProfileAvatar size={40} /> so an
   * uploaded photo shows; without it the bar falls back to initials.
   */
  avatar?: React.ReactNode
  /** The date, usually. Small and muted above the greeting. */
  eyebrow?: string
  title: string
  onAvatarPress?: () => void
  right?: React.ReactNode
}) {
  const { theme: t } = useTheme()
  const insets = useSafeAreaInsets()

  return (
    <View style={[tb.bar, { paddingTop: insets.top + 10 }]}>
      {avatar ?? (
        <TouchableOpacity
          onPress={onAvatarPress}
          disabled={!onAvatarPress}
          accessibilityRole={onAvatarPress ? 'button' : undefined}
          accessibilityLabel={onAvatarPress ? 'Your profile' : undefined}
          style={[tb.avatar, { backgroundColor: t.accentBg, borderColor: t.accentBorder }]}
        >
          <Text style={[tb.avatarText, { color: t.accent }]}>{initials ?? '·'}</Text>
        </TouchableOpacity>
      )}

      <View style={{ flex: 1, minWidth: 0 }}>
        {!!eyebrow && <Text style={[tb.eyebrow, { color: t.textMuted }]} numberOfLines={1}>{eyebrow}</Text>}
        <Text style={[tb.title, { color: t.textPrimary }]} numberOfLines={1} accessibilityRole="header">{title}</Text>
      </View>

      {right}
    </View>
  )
}

/** Round outlined button for the top bar's right slot. */
export function TopBarButton({ icon, label, onPress, dot }: {
  icon: IconName; label: string; onPress: () => void; dot?: boolean
}) {
  const { theme: t } = useTheme()
  return (
    <TouchableOpacity
      onPress={() => { haptics.tap(); onPress() }}
      accessibilityRole="button" accessibilityLabel={label}
      style={[tb.round, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}
    >
      <Ionicons name={icon} size={19} color={t.textPrimary} />
      {dot && <View style={[tb.dot, { borderColor: t.cardBg, backgroundColor: t.accent }]} />}
    </TouchableOpacity>
  )
}

// ── pills ─────────────────────────────────────────────────────────────────────

/** Outlined pill, optionally with a chevron for a picker. */
export function Pill({ label, value, icon, onPress, tone = 'neutral' }: {
  label?: string
  value: string
  icon?: IconName
  onPress?: () => void
  tone?: 'neutral' | 'danger'
}) {
  const { theme: t } = useTheme()
  const danger = tone === 'danger'
  const fg = danger ? t.danger : t.textPrimary

  return (
    <TouchableOpacity
      onPress={onPress ? () => { haptics.tap(); onPress() } : undefined}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={label ? `${label} ${value}` : value}
      style={[pl.pill, {
        backgroundColor: danger ? t.dangerSubtle : t.cardBg,
        borderColor: danger ? t.dangerBorder : t.cardBorder,
      }]}
    >
      {!!icon && <Ionicons name={icon} size={13} color={fg} />}
      {!!label && <Text style={[pl.label, { color: t.textMuted }]}>{label}</Text>}
      <Text style={[pl.value, { color: fg }]} numberOfLines={1}>{value}</Text>
      {!!onPress && !danger && <Ionicons name="chevron-down" size={13} color={t.textMuted} />}
    </TouchableOpacity>
  )
}

// ── status card ───────────────────────────────────────────────────────────────

export function DateTile({ weekday, day, month }: { weekday: string; day: string; month: string }) {
  const { theme: t } = useTheme()
  const c = heroTones(t.id === 'forest')
  return (
    <View style={[hc.date, { backgroundColor: c.tileBg }]}>
      <Text style={[hc.dateWeekday, { color: c.tileSub }]}>{weekday}</Text>
      <Text style={[hc.dateDay, { color: c.tileInk }]}>{day}</Text>
      <Text style={[hc.dateMonth, { color: c.tileSub }]}>{month}</Text>
    </View>
  )
}

/**
 * A number in the hero's leading slot, where a patient's card shows a date:
 * how many are waiting, how many jobs are open. Same tile, different payload.
 */
export function CountTile({ value, label }: { value: number | string; label: string }) {
  const { theme: t } = useTheme()
  const c = heroTones(t.id === 'forest')
  return (
    <View style={[hc.date, { backgroundColor: c.tileBg, paddingVertical: 12 }]}>
      <Text style={[hc.countValue, { color: c.tileInk }]}>{value}</Text>
      <Text style={[hc.dateMonth, { color: c.tileSub }]}>{label}</Text>
    </View>
  )
}

/**
 * Four figures in one bordered card, split by hairlines rather than four
 * separate cards. At this size separate cards read as four things to act on;
 * these are one glance.
 */
export function StatGrid({ items }: {
  items: { label: string; value: string | number; muted?: boolean; onPress?: () => void }[]
}) {
  const { theme: t } = useTheme()
  return (
    <View style={[sg.wrap, { borderColor: t.cardBorder, backgroundColor: t.cardBg }]}>
      {items.map((it, i) => {
        const Cell: any = it.onPress ? TouchableOpacity : View
        return (
          <Cell
            key={it.label}
            onPress={it.onPress ? () => { haptics.tap(); it.onPress!() } : undefined}
            accessibilityRole={it.onPress ? 'button' : undefined}
            accessibilityLabel={`${it.label}: ${it.value}`}
            style={[
              sg.cell,
              // Hairlines only between cells, never on the card's own edge.
              i % 2 === 0 && { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: t.cardBorder },
              i < items.length - 2 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.cardBorder },
            ]}
          >
            <Text style={[sg.label, { color: t.textMuted }]} numberOfLines={2}>{it.label}</Text>
            <Text style={[sg.value, { color: it.muted ? t.textMuted : t.textPrimary }]} numberOfLines={1}>
              {it.value}
            </Text>
          </Cell>
        )
      })}
    </View>
  )
}

/**
 * The one gradient on the page: whatever matters most right now. An upcoming
 * visit for a patient, the next patient for a doctor, the active job for a
 * crew.
 *
 * `footer` renders as evenly split actions under a divider; two is the most
 * that stays tappable at phone width.
 */
export function HeroCard({
  eyebrow, status, children, footer, dots, onPress, style,
}: {
  eyebrow: string
  /** Right of the eyebrow, e.g. "Confirmed". */
  status?: { label: string; icon?: IconName }
  children: React.ReactNode
  footer?: { label: string; icon?: IconName; onPress: () => void }[]
  /** Page indicator when more than one of these is stacked. */
  dots?: { count: number; index: number }
  onPress?: () => void
  style?: StyleProp<ViewStyle>
}) {
  const { theme: t } = useTheme()
  const c = heroTones(t.id === 'forest')
  const Wrapper: any = onPress ? TouchableOpacity : View

  return (
    <Wrapper
      activeOpacity={0.92}
      onPress={onPress ? () => { haptics.tap(); onPress() } : undefined}
      accessibilityRole={onPress ? 'button' : undefined}
      style={style}
    >
      <LinearGradient
        colors={c.fill}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={hc.card}
      >
        <View style={hc.head}>
          <Text style={[hc.eyebrow, { color: c.soft }]} numberOfLines={1}>{eyebrow}</Text>
          {!!status && (
            <View style={hc.status}>
              <Ionicons name={status.icon ?? 'checkmark-circle'} size={13} color={c.accent} />
              <Text style={[hc.statusText, { color: c.accent }]}>{status.label}</Text>
            </View>
          )}
        </View>

        {children}

        {!!dots && dots.count > 1 && (
          <View style={hc.dots}>
            {Array.from({ length: dots.count }).map((_, i) => (
              <View key={i} style={[
                hc.dot,
                { backgroundColor: c.dotOff },
                i === dots.index && { width: 16, backgroundColor: c.accent },
              ]} />
            ))}
          </View>
        )}

        {!!footer?.length && (
          <View style={[hc.footer, { borderTopColor: c.divider }]}>
            {footer.map((f, i) => (
              <TouchableOpacity
                key={f.label}
                onPress={() => { haptics.tap(); f.onPress() }}
                accessibilityRole="button" accessibilityLabel={f.label}
                style={[hc.footerBtn, i > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: c.divider }]}
              >
                {!!f.icon && <Ionicons name={f.icon} size={14} color={c.accent} />}
                <Text style={[hc.footerText, { color: c.accent }]} numberOfLines={1}>{f.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </LinearGradient>
    </Wrapper>
  )
}

/** Name, detail line and time inside a HeroCard. */
export function HeroBody({ title, subtitle, meta, leading }: {
  title: string; subtitle?: string | null; meta?: string | null; leading?: React.ReactNode
}) {
  const { theme: t } = useTheme()
  const c = heroTones(t.id === 'forest')
  return (
    <View style={hc.body}>
      {leading}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[hc.title, { color: c.ink }]} numberOfLines={1}>{title}</Text>
        {!!subtitle && <Text style={[hc.subtitle, { color: c.soft }]} numberOfLines={1}>{subtitle}</Text>}
        {!!meta && <Text style={[hc.meta, { color: c.ink }]} numberOfLines={1}>{meta}</Text>}
      </View>
    </View>
  )
}

// ── quick actions ─────────────────────────────────────────────────────────────

/**
 * One of the four coloured tiles under Services. Four across, which is why the
 * label sits under the tile rather than inside it -- at phone width there is
 * no room for both.
 */
export function QuickTile({ icon, label, color, badge, onPress }: {
  icon: IconName
  label: string
  /** Solid tile colour. Carries the meaning, so it differs per action. */
  color: string
  badge?: string | null
  onPress: () => void
}) {
  const { theme: t } = useTheme()
  return (
    <TouchableOpacity
      onPress={() => { haptics.tap(); onPress() }}
      accessibilityRole="button" accessibilityLabel={badge ? `${label}, ${badge}` : label}
      style={qt.wrap}
    >
      {/* Dark icon on a bright fill, not white: these tiles are saturated
          pastels and white on them reads as washed out. */}
      <View style={[qt.tile, { backgroundColor: color }]}>
        <Ionicons name={icon} size={23} color="#0B2B26" />
        {!!badge && (
          <View style={[qt.badge, { backgroundColor: t.danger, borderColor: t.canvasBg }]}>
            <Text style={qt.badgeText} numberOfLines={1}>{badge}</Text>
          </View>
        )}
      </View>
      <Text style={[qt.label, { color: t.textSecondary }]} numberOfLines={2}>{label}</Text>
    </TouchableOpacity>
  )
}

export function QuickRow({ children }: { children: React.ReactNode }) {
  return <View style={qt.row}>{children}</View>
}

// ── sections ──────────────────────────────────────────────────────────────────

export function SectionHead({ title, action, onAction }: {
  title: string; action?: string; onAction?: () => void
}) {
  const { theme: t } = useTheme()
  return (
    <View style={sh.row}>
      <Text style={[sh.title, { color: t.textPrimary }]}>{title}</Text>
      {!!action && !!onAction && (
        <TouchableOpacity onPress={() => { haptics.tap(); onAction() }} accessibilityRole="button">
          <Text style={[sh.action, { color: t.accent }]}>{action}</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

/** A card row: leading element, two lines of text, optional trailing button. */
export function RowCard({ leading, title, subtitle, action, onActionPress, onPress }: {
  leading?: React.ReactNode
  title: string
  subtitle?: string | null
  action?: string
  onActionPress?: () => void
  onPress?: () => void
}) {
  const { theme: t } = useTheme()
  const Wrapper: any = onPress ? TouchableOpacity : View
  return (
    <Wrapper
      activeOpacity={0.85}
      onPress={onPress ? () => { haptics.tap(); onPress() } : undefined}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={onPress ? `${title}${subtitle ? `, ${subtitle}` : ''}` : undefined}
      style={[rc.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}
    >
      {leading}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[rc.title, { color: t.textPrimary }]} numberOfLines={1}>{title}</Text>
        {!!subtitle && <Text style={[rc.subtitle, { color: t.textMuted }]} numberOfLines={1}>{subtitle}</Text>}
      </View>
      {!!action && !!onActionPress && (
        <TouchableOpacity
          onPress={() => { haptics.tap(); onActionPress() }}
          accessibilityRole="button" accessibilityLabel={`${action} ${title}`}
          style={[rc.action, { backgroundColor: t.accent }]}
        >
          <Text style={[rc.actionText, { color: t.id === 'forest' ? '#081416' : '#FFFFFF' }]}>{action}</Text>
        </TouchableOpacity>
      )}
    </Wrapper>
  )
}

// ── styles ────────────────────────────────────────────────────────────────────

const tb = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 14 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  avatarText: { fontSize: 14, fontWeight: '800' },
  eyebrow: { fontSize: 12 },
  title: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  // Rounded square, not a circle: it reads as a control rather than a second face next to the avatar.
  round: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  dot: { position: 'absolute', top: 9, right: 10, width: 8, height: 8, borderRadius: 4, borderWidth: 1.5 },
})

const pl = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 12, borderRadius: 99, borderWidth: 1 },
  label: { fontSize: 12 },
  value: { fontSize: 12.5, fontWeight: '700' },
})

const hc = StyleSheet.create({
  card: { borderRadius: 20, padding: 16, gap: 12, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyebrow: { flex: 1, fontSize: 10.5, fontWeight: '800', letterSpacing: 1, color: '#8FD9CE' },
  status: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusText: { fontSize: 11.5, fontWeight: '700', color: '#6EE7D7' },

  body: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  title: { fontSize: 17, fontWeight: '800', color: '#FFFFFF' },
  subtitle: { fontSize: 13, color: '#B9D9D3', marginTop: 2 },
  meta: { fontSize: 13, color: '#8FD9CE', marginTop: 4, fontWeight: '600' },

  date: { width: 58, borderRadius: 14, paddingVertical: 9, alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.26)' },
  dateWeekday: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6, color: '#8FD9CE' },
  dateDay: { fontSize: 23, fontWeight: '800', color: '#FFFFFF', lineHeight: 27 },
  dateMonth: { fontSize: 10, fontWeight: '700' },
  countValue: { fontSize: 30, fontWeight: '800', lineHeight: 34 },

  dots: { flexDirection: 'row', gap: 5 },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.3)' },
  dotOn: { width: 16, backgroundColor: '#6EE7D7' },

  footer: {
    flexDirection: 'row', marginTop: 2, marginHorizontal: -16, marginBottom: -16,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.16)',
  },
  footerBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 13 },
  footerDivider: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: 'rgba(255,255,255,0.16)' },
  footerText: { fontSize: 13, fontWeight: '700', color: '#D6F2EC' },
})

const qt = StyleSheet.create({
  row: { flexDirection: 'row', gap: 10 },
  wrap: { flex: 1, alignItems: 'center', gap: 7 },
  tile: { width: '100%', aspectRatio: 1, maxHeight: 62, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 11.5, fontWeight: '600', textAlign: 'center', lineHeight: 15 },
  badge: {
    position: 'absolute', top: -5, right: -5, minWidth: 18, height: 18, borderRadius: 9,
    paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center', borderWidth: 2,
  },
  badgeText: { fontSize: 10, fontWeight: '800', color: '#FFFFFF' },
})

const sg = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  cell: { width: '50%', paddingVertical: 16, paddingHorizontal: 14, gap: 8, minHeight: 86 },
  label: { fontSize: 12.5, lineHeight: 16 },
  value: { fontSize: 25, fontWeight: '800', letterSpacing: -0.5 },
})

const sh = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  title: { fontSize: 15.5, fontWeight: '800', letterSpacing: -0.2 },
  action: { fontSize: 13, fontWeight: '700' },
})

const rc = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1, padding: 12 },
  title: { fontSize: 14.5, fontWeight: '700' },
  subtitle: { fontSize: 12, marginTop: 2 },
  action: { paddingHorizontal: 14, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 12.5, fontWeight: '800' },
})
