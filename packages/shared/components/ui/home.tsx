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
 * The status card keeps its dark teal in light mode too. It is the one bold
 * element on the page, and inverting it in light mode would leave the screen
 * with no anchor.
 */

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
      {dot && <View style={[tb.dot, { borderColor: t.canvasBg }]} />}
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
  return (
    <View style={hc.date}>
      <Text style={hc.dateWeekday}>{weekday}</Text>
      <Text style={hc.dateDay}>{day}</Text>
      <Text style={hc.dateMonth}>{month}</Text>
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
  const Wrapper: any = onPress ? TouchableOpacity : View

  return (
    <Wrapper
      activeOpacity={0.92}
      onPress={onPress ? () => { haptics.tap(); onPress() } : undefined}
      accessibilityRole={onPress ? 'button' : undefined}
      style={style}
    >
      <LinearGradient
        colors={['#15514B', '#0C2E2C']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={hc.card}
      >
        <View style={hc.head}>
          <Text style={hc.eyebrow} numberOfLines={1}>{eyebrow}</Text>
          {!!status && (
            <View style={hc.status}>
              <Ionicons name={status.icon ?? 'checkmark-circle'} size={13} color="#6EE7D7" />
              <Text style={hc.statusText}>{status.label}</Text>
            </View>
          )}
        </View>

        {children}

        {!!dots && dots.count > 1 && (
          <View style={hc.dots}>
            {Array.from({ length: dots.count }).map((_, i) => (
              <View key={i} style={[hc.dot, i === dots.index && hc.dotOn]} />
            ))}
          </View>
        )}

        {!!footer?.length && (
          <View style={hc.footer}>
            {footer.map((f, i) => (
              <TouchableOpacity
                key={f.label}
                onPress={() => { haptics.tap(); f.onPress() }}
                accessibilityRole="button" accessibilityLabel={f.label}
                style={[hc.footerBtn, i > 0 && hc.footerDivider]}
              >
                {!!f.icon && <Ionicons name={f.icon} size={14} color="#D6F2EC" />}
                <Text style={hc.footerText} numberOfLines={1}>{f.label}</Text>
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
  return (
    <View style={hc.body}>
      {leading}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={hc.title} numberOfLines={1}>{title}</Text>
        {!!subtitle && <Text style={hc.subtitle} numberOfLines={1}>{subtitle}</Text>}
        {!!meta && <Text style={hc.meta} numberOfLines={1}>{meta}</Text>}
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
      <View style={[qt.tile, { backgroundColor: color }]}>
        <Ionicons name={icon} size={23} color="#FFFFFF" />
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
  round: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  dot: { position: 'absolute', top: 8, right: 9, width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444', borderWidth: 1.5 },
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
  dateMonth: { fontSize: 10, fontWeight: '700', color: '#8FD9CE' },

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
