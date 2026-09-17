import { createContext, useContext, useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

// Structural scale, not color -- identical across every scheme on purpose, and
// mirrored (same numeric values) in web/src/contexts/ThemeContext.tsx's own `scale`
// so a card or button is the same size on web and mobile even though the two token
// systems aren't code-shared. `font.display` is new: the MD3 mockups this palette
// was redrawn from use a much bigger number for splash/hero branding (48) and stat
// values (28-30) than anything this app reached for before (`hero` topped out at
// 26) -- added rather than repurposing `hero`, so nothing that already reads `hero`
// silently gets bigger.
const scale = {
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 },
  radius:  { sm: 10, md: 14, lg: 20, pill: 99 },
  font:    { xs: 11, sm: 12, base: 13, md: 14, lg: 16, xl: 18, title: 22, hero: 30, display: 44 },
}

// ── MD3 color science, redrawn from the four scheme mockups (queue-hospital-md /
// queue-patient-md) exactly -- every primary/container/surface/outline value below
// is the literal hex the mockups used for that scheme, not a re-tint. Two
// independent dimensions, matching the mockups: a theme family (forest/clinical)
// and a mode (light/dark), four total combinations, each reachable on its own
// (see ThemeProvider below) rather than forest always meaning dark and clinical
// always meaning light.
//
// This app's own token names (canvasBg, cardBg, textPrimary, ...) are kept --
// every screen in the app already reads these by name, and renaming them would
// mean touching every screen instead of just this file. Each name below is
// mapped to the MD3 field with the matching semantic role:
//   canvasBg -> surfaceContainer   (recessed page background, one step behind cards)
//   cardBg   -> surface            (the card/content surface itself)
//   textPrimary/Secondary/Muted -> onSurface / onSurfaceVariant / outline
//     (MD3's own three-tier emphasis ladder for text on a surface)
//   accent -> primary; danger -> error; info -> blue (MD3's dedicated "info" hue
//     in these mockups, distinct from primary)
//   statusOpen/Busy/Virtual/Cancelled/Approval/Progress/Neutral -> the container/
//     on-container pair MD3 uses for an equivalent status chip in the mockups
//     (confirmed->primary, waiting->amber, virtual->tertiary, cancelled->error,
//     pending approval->purple, in-progress->secondary, neutral->surfaceVariant)
// Tint tokens (accentBg, dangerSubtle, ...) that don't have a direct MD3 field are
// computed as an rgba of the matching solid MD3 color at the opacity this app
// already used for that role, so the *hue* is always the template's own color,
// just applied at a "thin tint behind small text" strength instead of a "bold
// fill" strength (that bold-fill role is exactly what the new *Container/
// onAccentContainer pair -- and the newly-added on* pairs below it -- covers.)

const forestLight = {
  id: 'forest' as const, mode: 'light' as const,
  ...scale,
  canvasBg:    '#EAEEEA',
  cardBg:      '#F6FBF4',
  cardBorder:  '#BFC9BF',
  accent:      '#006D3E',
  // The color that reads on top of a solid `accent` fill (a primary button's own
  // label, a filled chip's icon) -- MD3's onPrimary for this exact scheme, not a
  // dark/light guess. Needed as its own token once forest could mean either mode:
  // forest-light's accent is a deep, saturated green (wants white text) while
  // forest-dark's is a pale mint (wants dark text) -- the two used to share one
  // `t.id === 'forest' ? dark : white` heuristic across every call site because
  // forest only ever meant dark before. That heuristic is wrong half the time now.
  onAccent:    '#FFFFFF',
  accentDark:  '#006D3E',
  accentBg:    'rgba(0,109,62,0.12)',
  accentBgMid: 'rgba(0,109,62,0.08)',
  accentBorder:'rgba(0,109,62,0.28)',
  successSubtle: 'rgba(0,109,62,0.12)',
  successBorder: 'rgba(0,109,62,0.3)',
  textPrimary:  '#181D19',
  textSecondary:'#404943',
  // MD3's own outline field is tuned for borders/icons (~3:1 against surface),
  // not small text -- this app's textMuted carries timestamps and helper copy,
  // genuinely small text that needs the 4.5:1 text floor. onSurfaceVariant
  // (same value as textSecondary) is the field MD3 actually engineers for that,
  // so textMuted reuses it rather than a lower-contrast tone with no such
  // guarantee. The two collapse to one shade as a result -- a deliberate trade
  // of hierarchy nuance for guaranteed legibility.
  textMuted:    '#404943',
  danger:      '#BA1A1A',
  info:        '#1D4ED8',
  dangerBg:      'rgba(186,26,26,0.14)',
  dangerSubtle:  'rgba(186,26,26,0.1)',
  dangerBorder:  'rgba(186,26,26,0.3)',
  dangerStrong:  'rgba(186,26,26,0.4)',
  infoBg:        'rgba(29,78,216,0.14)',
  infoSubtle:    'rgba(29,78,216,0.12)',
  infoBorder:    'rgba(29,78,216,0.3)',
  statusOpen:     { bg:'#9EF5BC', text:'#002112', border:'rgba(0,109,62,0.28)' },
  statusBusy:     { bg:'#FEF3C7', text:'#451A03', border:'rgba(180,83,9,0.28)' },
  statusVirtual:  { bg:'#C2E8FD', text:'#001F2B', border:'rgba(62,99,116,0.28)' },
  statusCancelled:{ bg:'#FFDAD6', text:'#410002', border:'rgba(186,26,26,0.28)' },
  statusApproval: { bg:'#EDE9FE', text:'#2D1B69', border:'rgba(109,40,217,0.28)' },
  statusProgress: { bg:'#CFF0DC', text:'#0A1F14', border:'rgba(77,99,86,0.28)' },
  statusNeutral:  { bg:'#DCE5DB', text:'#404943', border:'#BFC9BF' },
  bannerBg:    '#003D24',
  bannerBorder:'rgba(0,109,62,0.28)',
  inputBg:     '#E4E9E4',
  inputBorder: '#707973',
  starColor:   '#B45309',
  splashBg:    '#003D24',
  accentContainer:   '#9EF5BC',
  onAccentContainer: '#002112',
  // MD3's errorContainer/onErrorContainer -- a bold tonal-fill pairing for a
  // whole-surface emergency/alert banner, as distinct from dangerBg/Subtle/
  // Border/Strong's "thin tint behind small text" role above.
  dangerContainer:   '#FFDAD6',
  onDangerContainer: '#410002',
  // MD3's onError -- text/icon color on a SOLID danger fill (a filled "Book now"
  // button), distinct from onDangerContainer's pastel-fill pairing above.
  onDanger:          '#FFFFFF',
}

const forestDark = {
  id: 'forest' as const, mode: 'dark' as const,
  ...scale,
  canvasBg:    '#1A201A',
  cardBg:      '#0F1410',
  cardBorder:  '#404943',
  accent:      '#7EDBA0',
  onAccent:    '#00391F',
  accentDark:  '#7EDBA0',
  accentBg:    'rgba(126,219,160,0.14)',
  accentBgMid: 'rgba(126,219,160,0.10)',
  accentBorder:'rgba(126,219,160,0.28)',
  successSubtle: 'rgba(126,219,160,0.14)',
  successBorder: 'rgba(126,219,160,0.3)',
  textPrimary:  '#DEE4DE',
  textSecondary:'#BFC9BF',
  // See forestLight's own comment on this same field.
  textMuted:    '#BFC9BF',
  danger:      '#FFB4AB',
  info:        '#93C5FD',
  dangerBg:      'rgba(255,180,171,0.16)',
  dangerSubtle:  'rgba(255,180,171,0.12)',
  dangerBorder:  'rgba(255,180,171,0.32)',
  dangerStrong:  'rgba(255,180,171,0.42)',
  infoBg:        'rgba(147,197,253,0.16)',
  infoSubtle:    'rgba(147,197,253,0.12)',
  infoBorder:    'rgba(147,197,253,0.32)',
  statusOpen:     { bg:'#005230', text:'#9EF5BC', border:'rgba(126,219,160,0.28)' },
  statusBusy:     { bg:'#452B00', text:'#FBD06A', border:'rgba(251,208,106,0.28)' },
  statusVirtual:  { bg:'#244C5D', text:'#C2E8FD', border:'rgba(166,205,217,0.28)' },
  statusCancelled:{ bg:'#93000A', text:'#FFDAD6', border:'rgba(255,180,171,0.28)' },
  statusApproval: { bg:'#2D1B69', text:'#EDE9FE', border:'rgba(196,181,253,0.28)' },
  statusProgress: { bg:'#354B3F', text:'#CFF0DC', border:'rgba(179,204,188,0.28)' },
  statusNeutral:  { bg:'#404943', text:'#BFC9BF', border:'#404943' },
  bannerBg:    '#002112',
  bannerBorder:'rgba(126,219,160,0.28)',
  inputBg:     '#1A201A',
  inputBorder: '#404943',
  starColor:   '#FBD06A',
  splashBg:    '#002112',
  accentContainer:   '#005230',
  onAccentContainer: '#9EF5BC',
  dangerContainer:   '#93000A',
  onDangerContainer: '#FFDAD6',
  onDanger:          '#690005',
}

const clinicalLight = {
  id: 'clinical' as const, mode: 'light' as const,
  ...scale,
  canvasBg:    '#ECEEF4',
  cardBg:      '#F8F9FF',
  cardBorder:  '#C3C6CF',
  accent:      '#005DB8',
  onAccent:    '#FFFFFF',
  accentDark:  '#005DB8',
  accentBg:    'rgba(0,93,184,0.12)',
  accentBgMid: 'rgba(0,93,184,0.08)',
  accentBorder:'rgba(0,93,184,0.30)',
  successSubtle: 'rgba(0,93,184,0.12)',
  successBorder: 'rgba(0,93,184,0.3)',
  textPrimary:  '#191C20',
  textSecondary:'#43474E',
  // See forestLight's own comment on this same field.
  textMuted:    '#43474E',
  danger:      '#BA1A1A',
  info:        '#1D4ED8',
  dangerBg:      'rgba(186,26,26,0.14)',
  dangerSubtle:  'rgba(186,26,26,0.1)',
  dangerBorder:  'rgba(186,26,26,0.3)',
  dangerStrong:  'rgba(186,26,26,0.4)',
  infoBg:        'rgba(29,78,216,0.14)',
  infoSubtle:    'rgba(29,78,216,0.12)',
  infoBorder:    'rgba(29,78,216,0.3)',
  statusOpen:     { bg:'#D5E3FF', text:'#001B3D', border:'rgba(0,93,184,0.28)' },
  statusBusy:     { bg:'#FEF3C7', text:'#451A03', border:'rgba(180,83,9,0.28)' },
  statusVirtual:  { bg:'#F5D9FF', text:'#261430', border:'rgba(109,86,116,0.28)' },
  statusCancelled:{ bg:'#FFDAD6', text:'#410002', border:'rgba(186,26,26,0.28)' },
  statusApproval: { bg:'#EDE9FE', text:'#2D1B69', border:'rgba(109,40,217,0.28)' },
  statusProgress: { bg:'#D8E3F8', text:'#111C2B', border:'rgba(84,95,113,0.28)' },
  statusNeutral:  { bg:'#DFE2EB', text:'#43474E', border:'#C3C6CF' },
  bannerBg:    '#001C42',
  bannerBorder:'rgba(0,93,184,0.30)',
  inputBg:     '#E6E8EE',
  inputBorder: '#73777F',
  starColor:   '#B45309',
  splashBg:    '#001C42',
  accentContainer:   '#D5E3FF',
  onAccentContainer: '#001B3D',
  dangerContainer:   '#FFDAD6',
  onDangerContainer: '#410002',
  onDanger:          '#FFFFFF',
}

const clinicalDark = {
  id: 'clinical' as const, mode: 'dark' as const,
  ...scale,
  canvasBg:    '#1C1E24',
  cardBg:      '#111318',
  cardBorder:  '#43474E',
  accent:      '#A8C8FF',
  onAccent:    '#00306A',
  accentDark:  '#A8C8FF',
  accentBg:    'rgba(168,200,255,0.14)',
  accentBgMid: 'rgba(168,200,255,0.10)',
  accentBorder:'rgba(168,200,255,0.30)',
  successSubtle: 'rgba(168,200,255,0.14)',
  successBorder: 'rgba(168,200,255,0.3)',
  textPrimary:  '#E2E2E9',
  textSecondary:'#C3C6CF',
  // See forestLight's own comment on this same field.
  textMuted:    '#C3C6CF',
  danger:      '#FFB4AB',
  info:        '#93C5FD',
  dangerBg:      'rgba(255,180,171,0.16)',
  dangerSubtle:  'rgba(255,180,171,0.12)',
  dangerBorder:  'rgba(255,180,171,0.32)',
  dangerStrong:  'rgba(255,180,171,0.42)',
  infoBg:        'rgba(147,197,253,0.16)',
  infoSubtle:    'rgba(147,197,253,0.12)',
  infoBorder:    'rgba(147,197,253,0.32)',
  statusOpen:     { bg:'#00469A', text:'#D5E3FF', border:'rgba(168,200,255,0.28)' },
  statusBusy:     { bg:'#452B00', text:'#FBD06A', border:'rgba(251,208,106,0.28)' },
  statusVirtual:  { bg:'#553C5C', text:'#F5D9FF', border:'rgba(218,189,228,0.28)' },
  statusCancelled:{ bg:'#93000A', text:'#FFDAD6', border:'rgba(255,180,171,0.28)' },
  statusApproval: { bg:'#2D1B69', text:'#EDE9FE', border:'rgba(196,181,253,0.28)' },
  statusProgress: { bg:'#3C4758', text:'#D8E3F8', border:'rgba(187,199,220,0.28)' },
  statusNeutral:  { bg:'#43474E', text:'#C3C6CF', border:'#43474E' },
  bannerBg:    '#001B3D',
  bannerBorder:'rgba(168,200,255,0.28)',
  inputBg:     '#1C1E24',
  inputBorder: '#43474E',
  starColor:   '#FBD06A',
  splashBg:    '#001B3D',
  accentContainer:   '#00469A',
  onAccentContainer: '#D5E3FF',
  dangerContainer:   '#93000A',
  onDangerContainer: '#FFDAD6',
  onDanger:          '#690005',
}

export type Theme = typeof forestLight | typeof forestDark | typeof clinicalLight | typeof clinicalDark
export type ThemeFamily = 'forest' | 'clinical'
export type ThemeMode = 'light' | 'dark'

export const themes = {
  'forest-light':   forestLight,
  'forest-dark':    forestDark,
  'clinical-light': clinicalLight,
  'clinical-dark':  clinicalDark,
} as const

const FAMILY_KEY = 'queue:theme'
const MODE_KEY   = 'queue:theme-mode'

interface ThemeCtx {
  theme: Theme
  themeId: ThemeFamily
  mode: ThemeMode
  toggleTheme: () => void
  toggleMode: () => void
  setMode: (mode: ThemeMode) => void
}

const Ctx = createContext<ThemeCtx>({
  theme: forestLight, themeId: 'forest', mode: 'light',
  toggleTheme: () => {}, toggleMode: () => {}, setMode: () => {},
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeId] = useState<ThemeFamily>('forest')
  const [mode,    setModeState] = useState<ThemeMode>('dark')

  // Load persisted theme + mode preference on startup. Forest previously always
  // meant dark and clinical always meant light -- a saved 'forest'/'clinical' from
  // before this change still resolves correctly since forest still defaults to
  // dark and clinical to light when no separate mode was ever saved.
  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(FAMILY_KEY),
      AsyncStorage.getItem(MODE_KEY),
    ]).then(([savedFamily, savedMode]) => {
      if (savedFamily === 'forest' || savedFamily === 'clinical') setThemeId(savedFamily)
      if (savedMode === 'light' || savedMode === 'dark') {
        setModeState(savedMode)
      } else if (savedFamily === 'clinical') {
        setModeState('light')
      }
    }).catch(() => {/* ignore storage errors */})
  }, [])

  function toggleTheme() {
    setThemeId(prev => {
      const next: ThemeFamily = prev === 'forest' ? 'clinical' : 'forest'
      AsyncStorage.setItem(FAMILY_KEY, next).catch(() => {/* ignore storage errors */})
      return next
    })
  }

  function setMode(next: ThemeMode) {
    setModeState(next)
    AsyncStorage.setItem(MODE_KEY, next).catch(() => {/* ignore storage errors */})
  }

  function toggleMode() {
    setMode(mode === 'light' ? 'dark' : 'light')
  }

  const theme = themes[`${themeId}-${mode}`]

  return (
    <Ctx.Provider value={{ theme, themeId, mode, toggleTheme, toggleMode, setMode }}>
      {children}
    </Ctx.Provider>
  )
}

export const useTheme = () => useContext(Ctx)
