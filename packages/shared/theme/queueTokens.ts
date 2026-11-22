/**
 * The v4 design-handoff palettes, straight from the designer's tokens.json
 * (queue-patient-handoff/tokens.json).
 *
 * These are a SECOND pair of palettes, not a replacement: ThemeProvider still
 * defaults to forest/clinical, and an app opts in by passing `palettes` (see
 * ThemeContext). That is what makes "one app at a time" possible -- the patient
 * app renders on paper/ink while doctor, hospital and ambulance keep the v3.1
 * look until their own redesign lands.
 *
 * Every key of the existing Theme shape is filled in, because ~83 files read
 * `useTheme()` and a missing key renders as `undefined` (transparent) rather
 * than failing loudly. The handoff's own vocabulary (surface/elev/ink70/sel/
 * field/tab/map/road, and the amber/green/red fill+bg families) is added on top
 * as `q`, so new screens can speak the designer's names instead of guessing
 * which v3.1 key happens to hold the same colour.
 */

const scale = {
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 },
  radius:  { sm: 10, md: 14, lg: 20, pill: 99 },
  font:    { xs: 11, sm: 12, base: 13, md: 14, lg: 16, xl: 18, title: 22, hero: 26 },
}

/** Logo colours and motion curves are theme-independent in the handoff. */
export const brand = {
  logo:   { tile: '#0F4A43', bar: '#FFFFFF', arm: '#D6E4E1', you: '#FF7A59' },
  motion: {
    // Both are the designer's cubic-beziers. react-native-reanimated's Easing
    // takes the same four control points.
    easeOut: [0.23, 1, 0.32, 1] as const,
    drawer:  [0.32, 0.72, 0, 1] as const,
    pressScale: 0.97,
  },
}

/**
 * The handoff's own token names. `q` is where a redesigned screen reads from;
 * the flat v3.1 keys below exist so shared components written against the old
 * vocabulary keep rendering correctly on these palettes.
 */
export interface QTokens {
  bg: string; surface: string; elev: string
  ink: string; ink70: string; ink60: string
  teal: string; primary: string; onPrimary: string
  red: string; redFill: string; redBg: string
  amber: string; amberFill: string; amberBg: string
  green: string; greenFill: string; greenBg: string
  muted: string; sel: string; field: string; tab: string
  map: string; road: string
  /** Hairline between rows and around cards. The handoff draws these as an
   *  ink alpha in light and a chalk alpha in dark, not as a named token. */
  line: string
}

const qLight: QTokens = {
  bg: '#F3F2ED', surface: '#FFFFFF', elev: '#FFFFFF',
  ink: '#0B1114', ink70: '#33434A', ink60: '#55656B',
  teal: '#0F766E', primary: '#0F766E', onPrimary: '#FFFFFF',
  red: '#BE123C', redFill: '#E11D48', redBg: '#FFE4E9',
  amber: '#B45309', amberFill: '#D97706', amberBg: '#FEF3C7',
  green: '#047857', greenFill: '#10B981', greenBg: '#D1FAE5',
  muted: '#ECEBE5', sel: '#E3F2EF', field: '#FFFFFF', tab: '#FFFFFF',
  map: '#E6E3DA', road: '#FFFFFF',
  line: 'rgba(11,17,20,0.09)',
}

// tokens.json's `dark` and `night` are identical; one palette covers both.
const qDark: QTokens = {
  bg: '#0B1114', surface: '#111A1E', elev: '#162228',
  ink: '#E6EDF0', ink70: '#B4C2C8', ink60: '#94A3AB',
  teal: '#2DD4BF', primary: '#14B8A6', onPrimary: '#042F2E',
  red: '#FB7185', redFill: '#E11D48', redBg: 'rgba(225,29,72,0.16)',
  amber: '#F59E0B', amberFill: '#D97706', amberBg: 'rgba(217,119,6,0.18)',
  green: '#34D399', greenFill: '#10B981', greenBg: 'rgba(16,185,129,0.16)',
  muted: '#162228', sel: 'rgba(45,212,191,0.14)', field: '#0E171A', tab: '#0E161A',
  map: '#0E1A1D', road: '#1B2A2F',
  line: 'rgba(230,237,240,0.10)',
}

/** Maps a handoff palette onto the v3.1 key names every existing screen reads. */
function bridge(id: string, q: QTokens) {
  return {
    id,
    ...scale,
    q,
    brand,
    /** Whether this palette is a dark one. Read this instead of comparing ids:
     *  there are now four palettes and there will be more, so `id === 'forest'`
     *  silently answers "light" for every dark palette that is not forest. */
    isDark: id === 'ink',

    canvasBg:    q.bg,
    cardBg:      q.surface,
    cardBorder:  q.line,
    accent:      q.primary,
    accentDark:  q.teal,
    accentBg:    q.sel,
    accentBgMid: q.sel,
    accentBorder:`${q.primary}4D`,          // ~30% -- the handoff draws selected borders this way
    successSubtle: q.greenBg,
    successBorder: `${q.greenFill}4D`,
    textPrimary:  q.ink,
    textSecondary:q.ink70,
    textMuted:    q.ink60,
    danger:       q.red,
    info:         id === 'ink' ? '#60A5FA' : '#1D4ED8',
    dangerBg:     q.redBg,
    dangerSubtle: q.redBg,
    dangerBorder: `${q.redFill}4D`,
    dangerStrong: `${q.redFill}66`,
    infoBg:       id === 'ink' ? 'rgba(96,165,250,0.14)' : '#DBEAFE',
    infoSubtle:   id === 'ink' ? 'rgba(96,165,250,0.10)' : '#EFF6FF',
    infoBorder:   id === 'ink' ? 'rgba(96,165,250,0.30)' : 'rgba(29,78,216,0.30)',

    // Status map. The handoff gives every pill a flat tinted ground and no
    // border, so border is set to transparent rather than to an alpha of the
    // fill -- a visible ring is the v3.1 look, not this one.
    statusOpen:      { bg: q.sel,     text: q.primary, border: 'transparent' },
    statusBusy:      { bg: q.amberBg, text: q.amber,   border: 'transparent' },
    statusVirtual:   { bg: id === 'ink' ? 'rgba(96,165,250,0.14)' : '#DBEAFE',
                       text: id === 'ink' ? '#93C5FD' : '#1D4ED8', border: 'transparent' },
    statusCancelled: { bg: q.muted,   text: q.ink60,   border: 'transparent' },
    statusApproval:  { bg: q.amberBg, text: q.amber,   border: 'transparent' },
    statusProgress:  { bg: q.primary, text: q.onPrimary, border: 'transparent' },
    statusNeutral:   { bg: q.muted,   text: q.ink60,   border: 'transparent' },
    statusSuccess:   { bg: q.greenBg, text: q.green,   border: 'transparent' },

    bannerBg:     q.elev,
    bannerBorder: q.line,
    inputBg:      q.field,
    inputBorder:  q.line,
    starColor:    q.amber,
    splashBg:     id === 'ink' ? q.bg : brand.logo.tile,
  }
}

/** Light. The patient and hospital apps default to this one. */
export const paper = bridge('paper', qLight)
/** Dark. The doctor and ambulance apps will default to this one. */
export const ink = bridge('ink', qDark)

export const queuePalettes = { paper, ink } as const
