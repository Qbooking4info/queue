'use client'
import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

// Structural scale, not color -- identical across every scheme, and numerically
// mirrored in packages/shared/contexts/ThemeContext.tsx's own `scale` (mobile) so a
// card or button is the same size on web and mobile even though the two token
// systems aren't code-shared (web isn't in the npm workspace @queue/shared lives in).
//
// Radii track mobile's glass pass: softer, fully-rounded geometry.
const scale = {
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 },
  radius:  { sm: 14, md: 18, lg: 24, pill: 999 },
  font:    { xs: 11, sm: 12, base: 13, md: 14, lg: 16, xl: 18, title: 22, hero: 30, display: 44 },
}

// ── Frosted-glass design language ────────────────────────────────────────────
//
// The web counterpart of packages/shared/contexts/ThemeContext.tsx -- same two
// families (Teal, Clinical), same light/dark, same reasoning; only the token
// names on the left differ between the platforms.
//
// Every pre-existing token name is kept and remapped, so the dashboard's
// components pick up the new look without being rewritten. The glass tokens
// (glass/glassBorder/blur/pageBg/heroGradient/...) are additive.
//
// Unlike mobile, the browser HAS backdrop-filter, so `blur` is a real CSS value
// here and translucent surfaces genuinely frost what is behind them.
//
// Note on `id`: the family ids stay 'forest'/'clinical' even though the forest
// family now renders teal -- the toggle in TopBar and the persisted
// localStorage value both key off them. `label` carries the real name.

const tealLight = {
  id: 'forest' as const, mode: 'light' as const, label: 'Teal light',
  ...scale,

  // Page + surfaces
  bg:           '#EBF4F4',
  pageBg:       'linear-gradient(180deg, #F3F9F9 0%, #E2EEEF 58%, #D3E4E6 100%)',
  bgAlt:        '#E4EFF0',
  card:         'rgba(255,255,255,0.50)',
  cardAlt:      'rgba(255,255,255,0.72)',
  glass:        'rgba(255,255,255,0.50)',
  glassStrong:  'rgba(255,255,255,0.72)',
  glassBorder:  'rgba(255,255,255,0.90)',
  chip:         '#FFFFFF',
  chipBorder:   'rgba(255,255,255,1)',
  blur:         'blur(22px) saturate(165%)',
  glassShadow:  '0 12px 32px rgba(12,70,78,0.10), 0 1px 0 rgba(12,70,78,0.04), inset 0 1px 0 rgba(255,255,255,0.95)',
  chipShadow:   '0 8px 18px rgba(12,70,78,0.13)',
  orbs:         ['#8FE3E0', '#9CD4EC', '#B8F0DC'],
  orbOpacity:   0.7,

  border:       'rgba(255,255,255,0.90)',
  borderMed:    'rgba(13,58,64,0.14)',
  borderDark:   'rgba(13,58,64,0.22)',

  // Sidebar is frosted rather than a solid slab of colour.
  sidebar:      'rgba(255,255,255,0.55)',
  sidebarHov:   'rgba(11,127,134,0.10)',
  sidebarActive:     'rgba(11,127,134,0.14)',
  sidebarActiveText: '#0B7F86',

  accent:       '#0B7F86',
  onAccent:     '#FFFFFF',
  accentLight:  'rgba(11,127,134,0.12)',
  accentDark:   '#0B7F86',
  accentMid:    'rgba(11,127,134,0.08)',
  accentBorder: 'rgba(11,127,134,0.28)',
  accentGlow:   'rgba(20,160,165,0.45)',
  btnGradient:  'linear-gradient(135deg, #0B7F86 0%, #1FA9AE 100%)',
  heroGradient: 'linear-gradient(125deg, #0B7F86 0%, #1AA6AB 52%, #7FDCD8 100%)',
  onHero:       '#FFFFFF',

  text:         '#0E2A2E',
  textSub:      '#3C5558',
  // textMuted carries timestamps and meta copy -- small text that needs the
  // 4.5:1 floor, which the lighter decorative tone does not clear on this
  // canvas. It reuses textSub; `textFaint` is the decorative tone.
  textMuted:    '#3C5558',
  textFaint:    '#6C8588',
  ink:          '#0D3A40',
  tick:         'rgba(13,58,64,0.16)',
  line:         'rgba(13,58,64,0.08)',

  red:          '#D2293A',
  redLight:     'rgba(210,41,58,0.09)',
  amber:        '#935600',
  amberLight:   'rgba(196,120,10,0.13)',
  blue:         '#1D5FB8',
  blueLight:    'rgba(29,95,184,0.10)',
  info:         '#1D5FB8',
  infoBg:       'rgba(29,95,184,0.12)',
  infoSubtle:   'rgba(29,95,184,0.10)',
  infoBorder:   'rgba(29,95,184,0.28)',
  purple:       '#5B2BC0',
  purpleLight:  'rgba(109,40,217,0.10)',

  rowAlt:       'rgba(255,255,255,0.35)',
  toggleTrack:  'rgba(11,127,134,0.20)',
  toggleThumb:  '#0B7F86',

  accentContainer:   'rgba(11,127,134,0.14)', onAccentContainer:   '#04383C',
  blueContainer:     'rgba(29,95,184,0.12)',  onBlueContainer:     '#123A73',
  purpleContainer:   'rgba(109,40,217,0.12)', onPurpleContainer:   '#2D1B69',
  amberContainer:    'rgba(196,120,10,0.14)', onAmberContainer:    '#5C3600',
}

const tealDark = {
  id: 'forest' as const, mode: 'dark' as const, label: 'Teal dark',
  ...scale,

  bg:           '#071416',
  pageBg:       'radial-gradient(120% 80% at 50% 0%, #0F2628 0%, #061314 58%, #020909 100%)',
  bgAlt:        '#09181A',
  card:         'rgba(255,255,255,0.06)',
  cardAlt:      'rgba(18,42,46,0.62)',
  glass:        'rgba(255,255,255,0.06)',
  glassStrong:  'rgba(18,42,46,0.62)',
  glassBorder:  'rgba(255,255,255,0.12)',
  chip:         'rgba(255,255,255,0.13)',
  chipBorder:   'rgba(255,255,255,0.22)',
  blur:         'blur(22px) saturate(165%)',
  glassShadow:  '0 12px 32px rgba(0,0,0,0.38), inset 0 1px 0 rgba(255,255,255,0.09)',
  chipShadow:   '0 8px 18px rgba(0,0,0,0.35)',
  orbs:         ['#0E7D82', '#1A6F9A', '#1F8A78'],
  orbOpacity:   0.55,

  border:       'rgba(255,255,255,0.12)',
  borderMed:    'rgba(255,255,255,0.16)',
  borderDark:   'rgba(255,255,255,0.22)',

  sidebar:      'rgba(18,42,46,0.62)',
  sidebarHov:   'rgba(127,224,220,0.10)',
  sidebarActive:     'rgba(127,224,220,0.16)',
  sidebarActiveText: '#A6F2EE',

  accent:       '#7FE0DC',
  onAccent:     '#00292B',
  accentLight:  'rgba(127,224,220,0.14)',
  accentDark:   '#7FE0DC',
  accentMid:    'rgba(127,224,220,0.10)',
  accentBorder: 'rgba(127,224,220,0.28)',
  accentGlow:   'rgba(40,180,180,0.50)',
  btnGradient:  'linear-gradient(135deg, #8FE8E4 0%, #25AFB0 100%)',
  heroGradient: 'linear-gradient(125deg, #0A6468 0%, #179C9F 55%, #5FD8D4 100%)',
  onHero:       '#FFFFFF',

  text:         '#E2F1F1',
  textSub:      '#AEC6C7',
  textMuted:    '#AEC6C7',
  textFaint:    '#7C9698',
  ink:          '#8FEDEA',
  tick:         'rgba(222,240,240,0.16)',
  line:         'rgba(255,255,255,0.08)',

  red:          '#FF8A8A',
  redLight:     'rgba(255,110,110,0.12)',
  amber:        '#FBD06A',
  amberLight:   'rgba(251,208,106,0.13)',
  blue:         '#C2DDFD',
  blueLight:    'rgba(166,190,230,0.13)',
  info:         '#C2DDFD',
  infoBg:       'rgba(166,190,230,0.16)',
  infoSubtle:   'rgba(166,190,230,0.12)',
  infoBorder:   'rgba(166,190,230,0.32)',
  purple:       '#DDD3FF',
  purpleLight:  'rgba(196,181,253,0.13)',

  rowAlt:       'rgba(255,255,255,0.04)',
  toggleTrack:  'rgba(127,224,220,0.24)',
  toggleThumb:  '#7FE0DC',

  accentContainer:   'rgba(127,224,220,0.16)', onAccentContainer:   '#A6F2EE',
  blueContainer:     'rgba(166,190,230,0.16)', onBlueContainer:     '#C2DDFD',
  purpleContainer:   'rgba(196,181,253,0.16)', onPurpleContainer:   '#DDD3FF',
  amberContainer:    'rgba(251,208,106,0.16)', onAmberContainer:    '#FBD06A',
}

const clinicalLight = {
  id: 'clinical' as const, mode: 'light' as const, label: 'Clinical light',
  ...scale,

  bg:           '#EFF2F8',
  pageBg:       'linear-gradient(180deg, #F5F7FC 0%, #E7EBF4 58%, #DAE0ED 100%)',
  bgAlt:        '#E8ECF5',
  card:         'rgba(255,255,255,0.50)',
  cardAlt:      'rgba(255,255,255,0.74)',
  glass:        'rgba(255,255,255,0.50)',
  glassStrong:  'rgba(255,255,255,0.74)',
  glassBorder:  'rgba(255,255,255,0.92)',
  chip:         '#FFFFFF',
  chipBorder:   'rgba(255,255,255,1)',
  blur:         'blur(22px) saturate(165%)',
  glassShadow:  '0 12px 32px rgba(30,52,110,0.10), 0 1px 0 rgba(30,52,110,0.04), inset 0 1px 0 rgba(255,255,255,0.95)',
  chipShadow:   '0 8px 18px rgba(30,52,110,0.13)',
  orbs:         ['#A9C1FF', '#CBD8FF', '#9FD8FF'],
  orbOpacity:   0.75,

  border:       'rgba(255,255,255,0.92)',
  borderMed:    'rgba(22,36,74,0.13)',
  borderDark:   'rgba(22,36,74,0.22)',

  sidebar:      'rgba(255,255,255,0.55)',
  sidebarHov:   'rgba(47,91,234,0.09)',
  sidebarActive:     'rgba(47,91,234,0.13)',
  sidebarActiveText: '#2449C8',

  accent:       '#2F5BEA',
  onAccent:     '#FFFFFF',
  accentLight:  'rgba(47,91,234,0.11)',
  accentDark:   '#2F5BEA',
  accentMid:    'rgba(47,91,234,0.08)',
  accentBorder: 'rgba(47,91,234,0.30)',
  accentGlow:   'rgba(63,108,242,0.45)',
  btnGradient:  'linear-gradient(135deg, #2F5BEA 0%, #5E82F7 100%)',
  heroGradient: 'linear-gradient(120deg, #3A68F0 0%, #5D81F7 46%, #A9BBFF 100%)',
  onHero:       '#FFFFFF',

  text:         '#14213D',
  textSub:      '#44506B',
  textMuted:    '#44506B',
  textFaint:    '#7A859C',
  ink:          '#16244A',
  tick:         'rgba(22,36,74,0.15)',
  line:         'rgba(22,36,74,0.08)',

  red:          '#E0263B',
  redLight:     'rgba(224,38,59,0.08)',
  amber:        '#935600',
  amberLight:   'rgba(196,120,10,0.12)',
  blue:         '#2449C8',
  blueLight:    'rgba(47,91,234,0.10)',
  info:         '#1D5FB8',
  infoBg:       'rgba(29,95,184,0.12)',
  infoSubtle:   'rgba(29,95,184,0.10)',
  infoBorder:   'rgba(29,95,184,0.28)',
  purple:       '#5B2BC0',
  purpleLight:  'rgba(109,40,217,0.10)',

  rowAlt:       'rgba(255,255,255,0.35)',
  toggleTrack:  'rgba(47,91,234,0.20)',
  toggleThumb:  '#2F5BEA',

  accentContainer:   'rgba(47,91,234,0.13)',   onAccentContainer:   '#001A42',
  blueContainer:     'rgba(47,91,234,0.12)',   onBlueContainer:     '#123A73',
  purpleContainer:   'rgba(109,40,217,0.12)',  onPurpleContainer:   '#2D1B69',
  amberContainer:    'rgba(196,120,10,0.14)',  onAmberContainer:    '#5C3600',
}

const clinicalDark = {
  id: 'clinical' as const, mode: 'dark' as const, label: 'Clinical dark',
  ...scale,

  bg:           '#090E20',
  pageBg:       'radial-gradient(120% 80% at 50% 0%, #15204A 0%, #080D1E 58%, #04060F 100%)',
  bgAlt:        '#0B1126',
  card:         'rgba(255,255,255,0.06)',
  cardAlt:      'rgba(22,30,64,0.62)',
  glass:        'rgba(255,255,255,0.06)',
  glassStrong:  'rgba(22,30,64,0.62)',
  glassBorder:  'rgba(255,255,255,0.12)',
  chip:         'rgba(255,255,255,0.13)',
  chipBorder:   'rgba(255,255,255,0.22)',
  blur:         'blur(22px) saturate(165%)',
  glassShadow:  '0 12px 32px rgba(0,0,0,0.40), inset 0 1px 0 rgba(255,255,255,0.09)',
  chipShadow:   '0 8px 18px rgba(0,0,0,0.35)',
  orbs:         ['#2448D0', '#51308C', '#1C6FB5'],
  orbOpacity:   0.55,

  border:       'rgba(255,255,255,0.12)',
  borderMed:    'rgba(255,255,255,0.16)',
  borderDark:   'rgba(255,255,255,0.22)',

  sidebar:      'rgba(22,30,64,0.62)',
  sidebarHov:   'rgba(168,200,255,0.10)',
  sidebarActive:     'rgba(168,200,255,0.16)',
  sidebarActiveText: '#D5E3FF',

  accent:       '#A8C8FF',
  onAccent:     '#0A1540',
  accentLight:  'rgba(168,200,255,0.14)',
  accentDark:   '#A8C8FF',
  accentMid:    'rgba(168,200,255,0.10)',
  accentBorder: 'rgba(168,200,255,0.30)',
  accentGlow:   'rgba(91,124,250,0.50)',
  btnGradient:  'linear-gradient(135deg, #A8C1FF 0%, #5B7CFA 100%)',
  heroGradient: 'linear-gradient(120deg, #2146C6 0%, #4D6DF0 55%, #93AAFF 100%)',
  onHero:       '#FFFFFF',

  text:         '#E6ECFA',
  textSub:      '#B3BED6',
  textMuted:    '#B3BED6',
  textFaint:    '#8290AD',
  ink:          '#B7CCFF',
  tick:         'rgba(226,232,250,0.16)',
  line:         'rgba(255,255,255,0.08)',

  red:          '#FF8A8A',
  redLight:     'rgba(255,110,110,0.12)',
  amber:        '#FBD06A',
  amberLight:   'rgba(251,208,106,0.13)',
  blue:         '#A8C8FF',
  blueLight:    'rgba(168,200,255,0.13)',
  info:         '#C2DDFD',
  infoBg:       'rgba(194,221,253,0.16)',
  infoSubtle:   'rgba(194,221,253,0.12)',
  infoBorder:   'rgba(194,221,253,0.32)',
  purple:       '#DDD3FF',
  purpleLight:  'rgba(196,181,253,0.13)',

  rowAlt:       'rgba(255,255,255,0.04)',
  toggleTrack:  'rgba(168,200,255,0.24)',
  toggleThumb:  '#A8C8FF',

  accentContainer:   'rgba(168,200,255,0.16)', onAccentContainer:   '#D5E3FF',
  blueContainer:     'rgba(168,200,255,0.16)', onBlueContainer:     '#D5E3FF',
  purpleContainer:   'rgba(196,181,253,0.16)', onPurpleContainer:   '#DDD3FF',
  amberContainer:    'rgba(251,208,106,0.16)', onAmberContainer:    '#FBD06A',
}

export type Theme = typeof tealLight | typeof tealDark | typeof clinicalLight | typeof clinicalDark
export type ThemeFamily = 'forest' | 'clinical'
export type ThemeMode = 'light' | 'dark'

export const themes = {
  'forest-light':   tealLight,
  'forest-dark':    tealDark,
  'clinical-light': clinicalLight,
  'clinical-dark':  clinicalDark,
}

const FAMILY_KEY = 'qb_dashboard_theme'
const MODE_KEY   = 'qb_dashboard_theme_mode'

interface ThemeContextValue {
  theme: Theme
  themeId: ThemeFamily
  mode: ThemeMode
  toggleTheme: () => void
  toggleMode: () => void
  setMode: (mode: ThemeMode) => void
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: clinicalLight, themeId: 'clinical', mode: 'light',
  toggleTheme: () => {}, toggleMode: () => {}, setMode: () => {},
})

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeId] = useState<ThemeFamily>('clinical')
  const [mode, setModeState]  = useState<ThemeMode>('light')

  useEffect(() => {
    const savedFamily = localStorage.getItem(FAMILY_KEY)
    const savedMode   = localStorage.getItem(MODE_KEY)
    if (savedFamily === 'forest' || savedFamily === 'clinical') setThemeId(savedFamily)
    if (savedMode === 'light' || savedMode === 'dark') setModeState(savedMode)
  }, [])

  // Mirror the active mode onto the document as data-theme so plain CSS can react
  // to it too, and publish the live palette as CSS custom properties -- the page
  // background gradient and the light orbs are painted in globals.css from these,
  // which is what lets every route sit on the wash without each one re-declaring it.
  useEffect(() => {
    const t = themes[`${themeId}-${mode}` as keyof typeof themes]
    const root = document.documentElement
    root.dataset.theme = mode
    root.style.setProperty('--focus-ring', t.accent)
    root.style.setProperty('--page-bg', t.pageBg)
    root.style.setProperty('--glass', t.glass)
    root.style.setProperty('--glass-border', t.glassBorder)
    root.style.setProperty('--glass-blur', t.blur)
    root.style.setProperty('--text', t.text)
    // Consumed by globals.css for the scrollbar thumb and ::selection, both of
    // which were fixed white/green for the old always-dark dashboard.
    root.style.setProperty('--border-med', t.borderMed)
    root.style.setProperty('--accent-muted', t.accentLight)
    root.style.setProperty('--orb-1', t.orbs[0])
    root.style.setProperty('--orb-2', t.orbs[1])
    root.style.setProperty('--orb-3', t.orbs[2])
    root.style.setProperty('--orb-opacity', String(t.orbOpacity))
  }, [mode, themeId])

  const toggleTheme = () => setThemeId(id => {
    const next: ThemeFamily = id === 'forest' ? 'clinical' : 'forest'
    localStorage.setItem(FAMILY_KEY, next)
    return next
  })

  const setMode = (next: ThemeMode) => {
    setModeState(next)
    localStorage.setItem(MODE_KEY, next)
  }

  const toggleMode = () => setMode(mode === 'light' ? 'dark' : 'light')

  const theme = themes[`${themeId}-${mode}` as keyof typeof themes]

  return (
    <ThemeContext.Provider value={{ theme, themeId, mode, toggleTheme, toggleMode, setMode }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
