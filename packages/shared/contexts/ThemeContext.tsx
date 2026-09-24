import { createContext, useContext, useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

// Structural scale, not color -- identical across every scheme on purpose, and
// mirrored (same numeric values) in web/src/contexts/ThemeContext.tsx's own `scale`
// so a card or button is the same size on web and mobile even though the two token
// systems aren't code-shared.
//
// Radii are deliberately larger than the previous MD3 pass: the glass language
// leans on soft, fully-rounded geometry (pill controls, 22-26px panels) rather
// than MD3's tighter corners. Anything reading radius.md/lg picks this up for free.
const scale = {
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 },
  radius:  { sm: 14, md: 18, lg: 24, pill: 999 },
  font:    { xs: 11, sm: 12, base: 13, md: 14, lg: 16, xl: 18, title: 22, hero: 30, display: 44 },
}

// ── Frosted-glass design language ────────────────────────────────────────────
//
// Translucent blurred panels over soft coloured light, raised near-opaque
// "chips" carrying key numbers, gradient hero cards, and pill-shaped controls.
// Two families -- Teal and Clinical -- each in light and dark.
//
// EVERY token name from the previous palette is kept and remapped, so screens
// that already read `t.cardBg`/`t.accent`/`t.statusBusy` pick up the new look
// with no edits. The genuinely new glass tokens (glass, chip, heroGradient,
// glassShadow, ...) are additive.
//
// Mapping of the old names into the new language:
//   canvasBg   -> the solid base the blurred panels sit on (screenGradient's midpoint)
//   cardBg     -> `glass`: a translucent fill. Over a BlurView this reads as real
//                 frosted glass; on its own it still reads as soft translucency,
//                 so a screen that hasn't been migrated to <Glass> yet degrades
//                 gracefully instead of looking broken.
//   cardBorder -> `glassBorder`: the bright 1px edge that gives glass its lift
//   bannerBg   -> the deepest stop of heroGradient, so existing "dark banner"
//                 surfaces stay intentional until they move to <Hero>
//
// Note on `id`: the family ids stay 'forest'/'clinical' even though the forest
// family now renders teal. Six screens branch on `themeId === 'forest'` for
// their toggle labels; renaming the id would silently break all of them. Each
// scheme carries a `label` for anything that wants to show the real name.

// React Native has no backdrop-filter, so translucency alone is not frosted
// glass -- <Glass> pairs these fills with expo-blur's BlurView. `blurTint` and
// `blurIntensity` are the per-scheme inputs for that.

const tealLight = {
  id: 'forest' as const, mode: 'light' as const, label: 'Teal light',
  ...scale,

  // Surfaces
  // Opaque on purpose. A navigator keeps every visited screen mounted, so a
  // transparent scene background lets all of them show through each other at once.
  canvasBg:    '#EBF4F4',
  canvasSolid: '#EBF4F4',
  screenGradient: ['#F2F9F9', '#E4EFF0'],
  cardBg:      'rgba(255,255,255,0.82)',
  cardBorder:  'rgba(255,255,255,0.90)',
  glass:       'rgba(255,255,255,0.82)',
  glassStrong: 'rgba(255,255,255,0.92)',
  glassBorder: 'rgba(255,255,255,0.90)',
  chip:        '#FFFFFF',
  chipBorder:  'rgba(255,255,255,1)',
  blurTint:    'light' as const,
  blurIntensity: 40,

  // Soft coloured light behind the glass
  orbs: ['#8FE3E0', '#9CD4EC', '#B8F0DC'],
  orbOpacity: 0.7,

  // Accent
  accent:      '#0B7F86',
  onAccent:    '#FFFFFF',
  accentDark:  '#0B7F86',
  accentBg:    'rgba(11,127,134,0.12)',
  accentBgMid: 'rgba(11,127,134,0.08)',
  accentBorder:'rgba(11,127,134,0.28)',
  accentSoft:  'rgba(11,127,134,0.12)',
  accentGlow:  'rgba(20,160,165,0.45)',
  btnGradient: ['#08666C', '#0B7F86'],
  onBtn:       '#FFFFFF',
  // Every stop stays dark enough for white text: the old gradients ran out to
  // pale mint/periwinkle, where white measured 1.6-2.2:1 against a 4.5:1 floor,
  // so labels faded out toward the light end of every hero.
  heroGradient:['#064B50', '#08666C', '#0B7F86'],
  onHero:      '#FFFFFF',

  successSubtle: 'rgba(11,127,134,0.12)',
  successBorder: 'rgba(11,127,134,0.30)',

  // Text. `ink` is the high-contrast hue used for chart strokes, not body copy.
  textPrimary:  '#0E2A2E',
  textSecondary:'#3C5558',
  // textMuted deliberately reuses textSecondary rather than the lighter
  // decorative grey: it carries timestamps and helper copy, genuinely small
  // text that needs the 4.5:1 floor, and the lighter tone measures ~3.7:1 on
  // this canvas. `textFaint` is that lighter tone, for decoration only.
  textMuted:    '#3C5558',
  textFaint:    '#6C8588',
  ink:          '#0D3A40',
  tick:         'rgba(13,58,64,0.16)',
  line:         'rgba(13,58,64,0.08)',

  // Semantic
  danger:      '#D2293A',
  info:        '#1D5FB8',
  dangerBg:      'rgba(210,41,58,0.14)',
  dangerSubtle:  'rgba(210,41,58,0.09)',
  dangerBorder:  'rgba(210,41,58,0.30)',
  dangerStrong:  'rgba(210,41,58,0.42)',
  dangerGlow:    'rgba(210,41,58,0.45)',
  infoBg:        'rgba(29,95,184,0.12)',
  infoSubtle:    'rgba(29,95,184,0.10)',
  infoBorder:    'rgba(29,95,184,0.28)',

  statusOpen:     { bg:'rgba(11,127,134,0.12)',  text:'#0B7F86', border:'rgba(11,127,134,0.22)' },
  statusBusy:     { bg:'rgba(196,120,10,0.13)',  text:'#935600', border:'rgba(196,120,10,0.26)' },
  statusVirtual:  { bg:'rgba(29,95,184,0.10)',   text:'#1D5FB8', border:'rgba(29,95,184,0.22)' },
  statusCancelled:{ bg:'rgba(210,41,58,0.10)',   text:'#BE2230', border:'rgba(210,41,58,0.24)' },
  statusApproval: { bg:'rgba(109,40,217,0.10)',  text:'#5B2BC0', border:'rgba(109,40,217,0.22)' },
  statusProgress: { bg:'rgba(42,106,110,0.12)',  text:'#2A6A6E', border:'rgba(42,106,110,0.22)' },
  statusNeutral:  { bg:'rgba(13,58,64,0.06)',    text:'#4C6366', border:'rgba(13,58,64,0.12)' },

  bannerBg:    '#0B7F86',
  bannerBorder:'rgba(255,255,255,0.35)',
  inputBg:     'rgba(255,255,255,0.55)',
  inputBorder: 'rgba(255,255,255,0.90)',
  starColor:   '#E09B1B',
  splashBg:    '#0B7F86',

  accentContainer:   '#CFF0EF',
  onAccentContainer: '#04383C',
  dangerContainer:   '#FBDDDF',
  onDangerContainer: '#5B0710',
  onDanger:          '#FFFFFF',
}

const tealDark = {
  id: 'forest' as const, mode: 'dark' as const, label: 'Teal dark',
  ...scale,

  // Opaque on purpose. A navigator keeps every visited screen mounted, so a
  // transparent scene background lets all of them show through each other at once.
  canvasBg:    '#071416',
  canvasSolid: '#071416',
  screenGradient: ['#09181A', '#051012'],
  cardBg:      'rgba(255,255,255,0.08)',
  cardBorder:  'rgba(255,255,255,0.12)',
  glass:       'rgba(255,255,255,0.08)',
  glassStrong: 'rgba(18,42,46,0.62)',
  glassBorder: 'rgba(255,255,255,0.12)',
  chip:        'rgba(0,0,0,0.30)',
  chipBorder:  'rgba(255,255,255,0.22)',
  blurTint:    'dark' as const,
  blurIntensity: 45,

  orbs: ['#0E7D82', '#1A6F9A', '#1F8A78'],
  orbOpacity: 0.55,

  accent:      '#7FE0DC',
  onAccent:    '#00292B',
  accentDark:  '#7FE0DC',
  accentBg:    'rgba(127,224,220,0.14)',
  accentBgMid: 'rgba(127,224,220,0.10)',
  accentBorder:'rgba(127,224,220,0.28)',
  accentSoft:  'rgba(127,224,220,0.14)',
  accentGlow:  'rgba(40,180,180,0.50)',
  btnGradient: ['#8FE8E4', '#25AFB0'],
  onBtn:       '#00292B',
  heroGradient:['#053E43', '#075A60', '#0A7278'],
  onHero:      '#FFFFFF',

  successSubtle: 'rgba(127,224,220,0.14)',
  successBorder: 'rgba(127,224,220,0.30)',

  textPrimary:  '#E2F1F1',
  textSecondary:'#AEC6C7',
  textMuted:    '#AEC6C7',
  textFaint:    '#7C9698',
  ink:          '#8FEDEA',
  tick:         'rgba(222,240,240,0.16)',
  line:         'rgba(255,255,255,0.08)',

  danger:      '#FF8A8A',
  info:        '#C2DDFD',
  dangerBg:      'rgba(255,138,138,0.16)',
  dangerSubtle:  'rgba(255,110,110,0.12)',
  dangerBorder:  'rgba(255,138,138,0.32)',
  dangerStrong:  'rgba(255,138,138,0.42)',
  dangerGlow:    'rgba(255,90,90,0.40)',
  infoBg:        'rgba(166,190,230,0.16)',
  infoSubtle:    'rgba(166,190,230,0.12)',
  infoBorder:    'rgba(166,190,230,0.32)',

  statusOpen:     { bg:'rgba(127,224,220,0.14)', text:'#A6F2EE', border:'rgba(127,224,220,0.28)' },
  statusBusy:     { bg:'rgba(251,208,106,0.13)', text:'#FBD06A', border:'rgba(251,208,106,0.28)' },
  statusVirtual:  { bg:'rgba(166,190,230,0.13)', text:'#C2DDFD', border:'rgba(166,190,230,0.28)' },
  statusCancelled:{ bg:'rgba(255,138,138,0.13)', text:'#FFB4AB', border:'rgba(255,138,138,0.30)' },
  statusApproval: { bg:'rgba(196,181,253,0.13)', text:'#DDD3FF', border:'rgba(196,181,253,0.28)' },
  statusProgress: { bg:'rgba(179,214,212,0.13)', text:'#CDEDEC', border:'rgba(179,214,212,0.26)' },
  statusNeutral:  { bg:'rgba(255,255,255,0.07)', text:'#BFCBCB', border:'rgba(255,255,255,0.14)' },

  bannerBg:    '#0A6468',
  bannerBorder:'rgba(255,255,255,0.20)',
  inputBg:     'rgba(255,255,255,0.07)',
  inputBorder: 'rgba(255,255,255,0.16)',
  starColor:   '#FBD06A',
  splashBg:    '#06282B',

  accentContainer:   '#12474A',
  onAccentContainer: '#A6F2EE',
  dangerContainer:   '#5A1418',
  onDangerContainer: '#FFD9D9',
  onDanger:          '#3B0006',
}

const clinicalLight = {
  id: 'clinical' as const, mode: 'light' as const, label: 'Clinical light',
  ...scale,

  // Opaque on purpose. A navigator keeps every visited screen mounted, so a
  // transparent scene background lets all of them show through each other at once.
  canvasBg:    '#EFF2F8',
  canvasSolid: '#EFF2F8',
  screenGradient: ['#F4F6FB', '#E8ECF5'],
  cardBg:      'rgba(255,255,255,0.82)',
  cardBorder:  'rgba(255,255,255,0.92)',
  glass:       'rgba(255,255,255,0.82)',
  glassStrong: 'rgba(255,255,255,0.92)',
  glassBorder: 'rgba(255,255,255,0.92)',
  chip:        '#FFFFFF',
  chipBorder:  'rgba(255,255,255,1)',
  blurTint:    'light' as const,
  blurIntensity: 40,

  orbs: ['#A9C1FF', '#CBD8FF', '#9FD8FF'],
  orbOpacity: 0.75,

  accent:      '#2F5BEA',
  onAccent:    '#FFFFFF',
  accentDark:  '#2F5BEA',
  accentBg:    'rgba(47,91,234,0.11)',
  accentBgMid: 'rgba(47,91,234,0.08)',
  accentBorder:'rgba(47,91,234,0.30)',
  accentSoft:  'rgba(47,91,234,0.11)',
  accentGlow:  'rgba(63,108,242,0.45)',
  btnGradient: ['#2246B5', '#2F5BEA'],
  onBtn:       '#FFFFFF',
  heroGradient:['#17307E', '#2246B5', '#2F5BEA'],
  onHero:      '#FFFFFF',

  successSubtle: 'rgba(47,91,234,0.11)',
  successBorder: 'rgba(47,91,234,0.30)',

  textPrimary:  '#14213D',
  textSecondary:'#44506B',
  textMuted:    '#44506B',
  textFaint:    '#7A859C',
  ink:          '#16244A',
  tick:         'rgba(22,36,74,0.15)',
  line:         'rgba(22,36,74,0.08)',

  danger:      '#E0263B',
  info:        '#1D5FB8',
  dangerBg:      'rgba(224,38,59,0.13)',
  dangerSubtle:  'rgba(224,38,59,0.08)',
  dangerBorder:  'rgba(224,38,59,0.30)',
  dangerStrong:  'rgba(224,38,59,0.42)',
  dangerGlow:    'rgba(224,38,59,0.45)',
  infoBg:        'rgba(29,95,184,0.12)',
  infoSubtle:    'rgba(29,95,184,0.10)',
  infoBorder:    'rgba(29,95,184,0.28)',

  statusOpen:     { bg:'rgba(47,91,234,0.10)',   text:'#2449C8', border:'rgba(47,91,234,0.22)' },
  statusBusy:     { bg:'rgba(196,120,10,0.12)',  text:'#935600', border:'rgba(196,120,10,0.26)' },
  statusVirtual:  { bg:'rgba(130,70,170,0.10)',  text:'#7A3AA6', border:'rgba(130,70,170,0.22)' },
  statusCancelled:{ bg:'rgba(224,38,59,0.09)',   text:'#C21F31', border:'rgba(224,38,59,0.24)' },
  statusApproval: { bg:'rgba(109,40,217,0.10)',  text:'#5B2BC0', border:'rgba(109,40,217,0.22)' },
  statusProgress: { bg:'rgba(60,90,140,0.10)',   text:'#35507E', border:'rgba(60,90,140,0.20)' },
  statusNeutral:  { bg:'rgba(22,36,74,0.06)',    text:'#4A5572', border:'rgba(22,36,74,0.12)' },

  bannerBg:    '#3A68F0',
  bannerBorder:'rgba(255,255,255,0.35)',
  inputBg:     'rgba(255,255,255,0.55)',
  inputBorder: 'rgba(255,255,255,0.92)',
  starColor:   '#E09B1B',
  splashBg:    '#2F5BEA',

  accentContainer:   '#D9E2FF',
  onAccentContainer: '#001A42',
  dangerContainer:   '#FBDDDF',
  onDangerContainer: '#5B0710',
  onDanger:          '#FFFFFF',
}

const clinicalDark = {
  id: 'clinical' as const, mode: 'dark' as const, label: 'Clinical dark',
  ...scale,

  // Opaque on purpose. A navigator keeps every visited screen mounted, so a
  // transparent scene background lets all of them show through each other at once.
  canvasBg:    '#090E20',
  canvasSolid: '#090E20',
  screenGradient: ['#0B1126', '#070B19'],
  cardBg:      'rgba(255,255,255,0.08)',
  cardBorder:  'rgba(255,255,255,0.12)',
  glass:       'rgba(255,255,255,0.08)',
  glassStrong: 'rgba(22,30,64,0.62)',
  glassBorder: 'rgba(255,255,255,0.12)',
  chip:        'rgba(0,0,0,0.30)',
  chipBorder:  'rgba(255,255,255,0.22)',
  blurTint:    'dark' as const,
  blurIntensity: 45,

  orbs: ['#2448D0', '#51308C', '#1C6FB5'],
  orbOpacity: 0.55,

  accent:      '#A8C8FF',
  onAccent:    '#0A1540',
  accentDark:  '#A8C8FF',
  accentBg:    'rgba(168,200,255,0.14)',
  accentBgMid: 'rgba(168,200,255,0.10)',
  accentBorder:'rgba(168,200,255,0.30)',
  accentSoft:  'rgba(168,200,255,0.14)',
  accentGlow:  'rgba(91,124,250,0.50)',
  btnGradient: ['#A8C1FF', '#5B7CFA'],
  onBtn:       '#0A1540',
  heroGradient:['#122461', '#1B379C', '#2549C8'],
  onHero:      '#FFFFFF',

  successSubtle: 'rgba(168,200,255,0.14)',
  successBorder: 'rgba(168,200,255,0.30)',

  textPrimary:  '#E6ECFA',
  textSecondary:'#B3BED6',
  textMuted:    '#B3BED6',
  textFaint:    '#8290AD',
  ink:          '#B7CCFF',
  tick:         'rgba(226,232,250,0.16)',
  line:         'rgba(255,255,255,0.08)',

  danger:      '#FF8A8A',
  info:        '#C2DDFD',
  dangerBg:      'rgba(255,138,138,0.16)',
  dangerSubtle:  'rgba(255,110,110,0.12)',
  dangerBorder:  'rgba(255,138,138,0.32)',
  dangerStrong:  'rgba(255,138,138,0.42)',
  dangerGlow:    'rgba(255,90,90,0.40)',
  infoBg:        'rgba(194,221,253,0.16)',
  infoSubtle:    'rgba(194,221,253,0.12)',
  infoBorder:    'rgba(194,221,253,0.32)',

  statusOpen:     { bg:'rgba(168,200,255,0.14)', text:'#D5E3FF', border:'rgba(168,200,255,0.28)' },
  statusBusy:     { bg:'rgba(251,208,106,0.13)', text:'#FBD06A', border:'rgba(251,208,106,0.28)' },
  statusVirtual:  { bg:'rgba(218,189,228,0.13)', text:'#F5D9FF', border:'rgba(218,189,228,0.28)' },
  statusCancelled:{ bg:'rgba(255,138,138,0.13)', text:'#FFB4AB', border:'rgba(255,138,138,0.30)' },
  statusApproval: { bg:'rgba(196,181,253,0.13)', text:'#DDD3FF', border:'rgba(196,181,253,0.28)' },
  statusProgress: { bg:'rgba(187,199,220,0.13)', text:'#D8E3F8', border:'rgba(187,199,220,0.26)' },
  statusNeutral:  { bg:'rgba(255,255,255,0.07)', text:'#C3C6CF', border:'rgba(255,255,255,0.14)' },

  bannerBg:    '#2146C6',
  bannerBorder:'rgba(255,255,255,0.20)',
  inputBg:     'rgba(255,255,255,0.07)',
  inputBorder: 'rgba(255,255,255,0.16)',
  starColor:   '#FBD06A',
  splashBg:    '#0B1740',

  accentContainer:   '#1B2A5C',
  onAccentContainer: '#D5E3FF',
  dangerContainer:   '#5A1418',
  onDangerContainer: '#FFD9D9',
  onDanger:          '#3B0006',
}

// Elevation presets. React Native can't express the layered CSS box-shadows the
// glass language uses, so these are the closest single-shadow equivalents,
// exported as spreadable style objects rather than strings.
export interface ShadowStyle {
  shadowColor: string
  shadowOffset: { width: number; height: number }
  shadowOpacity: number
  shadowRadius: number
  elevation: number
}

export const glassShadow: Record<ThemeMode, ShadowStyle> = {
  light: { shadowColor: '#0C464E', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.10, shadowRadius: 20, elevation: 4 },
  dark:  { shadowColor: '#000000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.38, shadowRadius: 20, elevation: 6 },
}

export const chipShadow: Record<ThemeMode, ShadowStyle> = {
  light: { shadowColor: '#0C464E', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.13, shadowRadius: 12, elevation: 3 },
  dark:  { shadowColor: '#000000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 5 },
}

export type Theme = typeof tealLight | typeof tealDark | typeof clinicalLight | typeof clinicalDark
export type ThemeFamily = 'forest' | 'clinical'
export type ThemeMode = 'light' | 'dark'

export const themes = {
  'forest-light':   tealLight,
  'forest-dark':    tealDark,
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
  /** Spreadable shadow for glass panels, already matched to the active mode. */
  shadow: ShadowStyle
  /** Spreadable shadow for raised value chips, matched to the active mode. */
  chipElevation: ShadowStyle
}

const Ctx = createContext<ThemeCtx>({
  theme: tealLight, themeId: 'forest', mode: 'light',
  toggleTheme: () => {}, toggleMode: () => {}, setMode: () => {},
  shadow: glassShadow.light, chipElevation: chipShadow.light,
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeId] = useState<ThemeFamily>('clinical')
  const [mode,    setModeState] = useState<ThemeMode>('light')

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(FAMILY_KEY),
      AsyncStorage.getItem(MODE_KEY),
    ]).then(([savedFamily, savedMode]) => {
      if (savedFamily === 'forest' || savedFamily === 'clinical') setThemeId(savedFamily)
      if (savedMode === 'light' || savedMode === 'dark') setModeState(savedMode)
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
    <Ctx.Provider value={{
      theme, themeId, mode, toggleTheme, toggleMode, setMode,
      shadow: glassShadow[mode],
      chipElevation: chipShadow[mode],
    }}>
      {children}
    </Ctx.Provider>
  )
}

export const useTheme = () => useContext(Ctx)
