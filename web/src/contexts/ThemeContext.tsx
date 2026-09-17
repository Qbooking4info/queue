'use client'
import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

// Structural scale, not color -- identical across every scheme, and numerically
// mirrored in packages/shared/contexts/ThemeContext.tsx's own `scale` (mobile) so a
// card or button is the same size on web and mobile even though the two token
// systems aren't code-shared (web isn't in the npm workspace @queue/shared lives in).
// `font.display` is new -- see mobile's own comment on this same addition.
const scale = {
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 },
  radius:  { sm: 10, md: 14, lg: 20, pill: 99 },
  font:    { xs: 11, sm: 12, base: 13, md: 14, lg: 16, xl: 18, title: 22, hero: 30, display: 44 },
}

// ── MD3 color science, redrawn from the four scheme mockups (queue-hospital-md /
// queue-patient-md) exactly -- see packages/shared/contexts/ThemeContext.tsx's own
// header comment for the full token-name mapping (that file and this one carry the
// same reasoning; only the names on the left differ between the two platforms).
// Two independent dimensions -- family (forest/clinical) x mode (light/dark) --
// four total combinations, each reachable on its own via ThemeProvider below.

const forestLight = {
  id: 'forest' as const, mode: 'light' as const,
  ...scale,
  bg:           '#EAEEEA',
  bgAlt:        '#E4E9E4',
  card:         '#F6FBF4',
  cardAlt:      '#DFE4DF',
  border:       '#BFC9BF',
  borderMed:    '#707973',
  borderDark:   '#404943',
  sidebar:      '#003D24',
  sidebarHov:   '#0A5234',
  accent:       '#006D3E',
  onAccent:     '#FFFFFF',
  accentLight:  'rgba(0,109,62,0.12)',
  accentDark:   '#006D3E',
  accentMid:    'rgba(0,109,62,0.08)',
  accentBorder: 'rgba(0,109,62,0.28)',
  text:         '#181D19',
  textSub:      '#404943',
  // MD3's outline field is tuned for borders/icons (~3:1 against surface), not
  // small text -- textMuted here carries timestamps/meta copy, genuinely small
  // text that needs the 4.5:1 text floor. onSurfaceVariant (textSub's own value)
  // is what MD3 actually engineers for that, so textMuted reuses it -- the two
  // collapse to one shade, trading hierarchy nuance for guaranteed legibility.
  textMuted:    '#404943',
  red:          '#BA1A1A',
  redLight:     'rgba(186,26,26,0.1)',
  amber:        '#B45309',
  amberLight:   '#FEF3C7',
  blue:         '#1D4ED8',
  blueLight:    'rgba(29,78,216,0.14)',
  info:         '#1D4ED8',
  infoBg:       'rgba(29,78,216,0.14)',
  infoSubtle:   'rgba(29,78,216,0.12)',
  infoBorder:   'rgba(29,78,216,0.3)',
  purple:       '#6D28D9',
  purpleLight:  '#EDE9FE',
  rowAlt:       '#EAEEEA',
  toggleTrack:  'rgba(0,109,62,0.20)',
  toggleThumb:  '#006D3E',
  accentContainer:   '#9EF5BC', onAccentContainer:   '#002112',
  blueContainer:     '#DBEAFE', onBlueContainer:     '#1E3A5F',
  purpleContainer:   '#EDE9FE', onPurpleContainer:   '#2D1B69',
  amberContainer:    '#FEF3C7', onAmberContainer:    '#451A03',
  sidebarActive:     '#9EF5BC', sidebarActiveText:   '#002112',
}

const forestDark = {
  id: 'forest' as const, mode: 'dark' as const,
  ...scale,
  bg:           '#0A0F0D',
  bgAlt:        '#0D1410',
  card:         '#111915',
  cardAlt:      '#161D19',
  border:       'rgba(255,255,255,0.07)',
  borderMed:    'rgba(255,255,255,0.11)',
  borderDark:   'rgba(255,255,255,0.16)',
  sidebar:      '#061208',
  sidebarHov:   '#0C1C10',
  accent:       '#7EDBA0',
  onAccent:     '#00391F',
  accentLight:  'rgba(126,219,160,0.14)',
  accentDark:   '#7EDBA0',
  accentMid:    'rgba(126,219,160,0.10)',
  accentBorder: 'rgba(126,219,160,0.28)',
  text:         '#E8F5EE',
  textSub:      '#BFC9BF',
  // See forestLight's own comment on this same field.
  textMuted:    '#BFC9BF',
  red:          '#FFB4AB',
  redLight:     'rgba(255,180,171,0.14)',
  amber:        '#FBD06A',
  amberLight:   'rgba(251,208,106,0.14)',
  blue:         '#93C5FD',
  blueLight:    'rgba(147,197,253,0.14)',
  info:         '#93C5FD',
  infoBg:       'rgba(147,197,253,0.16)',
  infoSubtle:   'rgba(147,197,253,0.12)',
  infoBorder:   'rgba(147,197,253,0.32)',
  purple:       '#C4B5FD',
  purpleLight:  'rgba(196,181,253,0.14)',
  rowAlt:       '#131A16',
  toggleTrack:  'rgba(126,219,160,0.20)',
  toggleThumb:  '#7EDBA0',
  accentContainer:   '#005230', onAccentContainer:   '#9EF5BC',
  blueContainer:     '#1E3A5F', onBlueContainer:     '#93C5FD',
  purpleContainer:   '#2D1B69', onPurpleContainer:   '#C4B5FD',
  amberContainer:    '#452B00', onAmberContainer:    '#FBD06A',
  sidebarActive:     '#005230', sidebarActiveText:   '#9EF5BC',
}

const clinicalLight = {
  id: 'clinical' as const, mode: 'light' as const,
  ...scale,
  bg:           '#ECEEF4',
  bgAlt:        '#E6E8EE',
  card:         '#F8F9FF',
  cardAlt:      '#E1E2E8',
  border:       '#C3C6CF',
  borderMed:    '#73777F',
  borderDark:   '#43474E',
  sidebar:      '#001C42',
  sidebarHov:   '#0A2E5C',
  accent:       '#005DB8',
  onAccent:     '#FFFFFF',
  accentLight:  '#D5E3FF',
  accentDark:   '#005DB8',
  accentMid:    'rgba(0,93,184,0.12)',
  accentBorder: 'rgba(0,93,184,0.30)',
  text:         '#191C20',
  textSub:      '#43474E',
  // See forestLight's own comment on this same field.
  textMuted:    '#43474E',
  red:          '#BA1A1A',
  redLight:     '#FFDAD6',
  amber:        '#B45309',
  amberLight:   '#FEF3C7',
  blue:         '#1D4ED8',
  blueLight:    '#DBEAFE',
  info:         '#1D4ED8',
  infoBg:       'rgba(29,78,216,0.14)',
  infoSubtle:   'rgba(29,78,216,0.12)',
  infoBorder:   'rgba(29,78,216,0.3)',
  purple:       '#6D28D9',
  purpleLight:  '#EDE9FE',
  rowAlt:       '#F8F9FF',
  toggleTrack:  'rgba(0,93,184,0.20)',
  toggleThumb:  '#005DB8',
  accentContainer:   '#D5E3FF', onAccentContainer:   '#001B3D',
  blueContainer:     '#DBEAFE', onBlueContainer:     '#1E3A5F',
  purpleContainer:   '#EDE9FE', onPurpleContainer:   '#2D1B69',
  amberContainer:    '#FEF3C7', onAmberContainer:    '#451A03',
  sidebarActive:     '#D5E3FF', sidebarActiveText:   '#001B3D',
}

const clinicalDark = {
  id: 'clinical' as const, mode: 'dark' as const,
  ...scale,
  bg:           '#111318',
  bgAlt:        '#1C1E24',
  card:         '#111318',
  cardAlt:      '#22252B',
  border:       '#43474E',
  borderMed:    '#8D9199',
  borderDark:   '#C3C6CF',
  sidebar:      '#090C12',
  sidebarHov:   '#141824',
  accent:       '#A8C8FF',
  onAccent:     '#00306A',
  accentLight:  'rgba(168,200,255,0.14)',
  accentDark:   '#A8C8FF',
  accentMid:    'rgba(168,200,255,0.10)',
  accentBorder: 'rgba(168,200,255,0.30)',
  text:         '#E2E2E9',
  textSub:      '#C3C6CF',
  // See forestLight's own comment on this same field.
  textMuted:    '#C3C6CF',
  red:          '#FFB4AB',
  redLight:     'rgba(255,180,171,0.14)',
  amber:        '#FBD06A',
  amberLight:   'rgba(251,208,106,0.14)',
  blue:         '#93C5FD',
  blueLight:    'rgba(147,197,253,0.14)',
  info:         '#93C5FD',
  infoBg:       'rgba(147,197,253,0.16)',
  infoSubtle:   'rgba(147,197,253,0.12)',
  infoBorder:   'rgba(147,197,253,0.32)',
  purple:       '#C4B5FD',
  purpleLight:  'rgba(196,181,253,0.14)',
  rowAlt:       '#1C1E24',
  toggleTrack:  'rgba(168,200,255,0.20)',
  toggleThumb:  '#A8C8FF',
  accentContainer:   '#00469A', onAccentContainer:   '#D5E3FF',
  blueContainer:     '#1E3A5F', onBlueContainer:     '#93C5FD',
  purpleContainer:   '#2D1B69', onPurpleContainer:   '#C4B5FD',
  amberContainer:    '#452B00', onAmberContainer:    '#FBD06A',
  sidebarActive:     '#00469A', sidebarActiveText:   '#D5E3FF',
}

export const themes = {
  'forest-light':   forestLight,
  'forest-dark':    forestDark,
  'clinical-light': clinicalLight,
  'clinical-dark':  clinicalDark,
}

export type Theme = typeof forestLight | typeof forestDark | typeof clinicalLight | typeof clinicalDark
export type ThemeFamily = 'forest' | 'clinical'
export type ThemeMode = 'light' | 'dark'
// Kept for existing call sites that only care about the family, not the mode.
export type ThemeId = ThemeFamily

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

export const useTheme = () => useContext(ThemeContext)

const FAMILY_KEY = 'qb_dashboard_theme'
const MODE_KEY   = 'qb_dashboard_theme_mode'

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeId] = useState<ThemeFamily>('clinical')
  const [mode,    setModeState] = useState<ThemeMode>('light')

  // clinical previously always meant light and forest always meant dark -- a
  // pre-existing saved family with no separate mode ever saved falls back to that
  // same pairing, so nobody's saved preference silently changes on this upgrade.
  useEffect(() => {
    const savedFamily = localStorage.getItem(FAMILY_KEY) as ThemeFamily | null
    const savedMode = localStorage.getItem(MODE_KEY) as ThemeMode | null
    if (savedFamily === 'forest' || savedFamily === 'clinical') setThemeId(savedFamily)
    if (savedMode === 'light' || savedMode === 'dark') {
      setModeState(savedMode)
    } else if (savedFamily === 'forest') {
      setModeState('dark')
    }
  }, [])

  // Mirror the active mode onto the document as data-theme, so plain CSS can react
  // to it too (globals.css carries a `:root[data-theme="light"]` skeleton-shimmer
  // block). Was keyed off themeId before mode existed as its own dimension.
  //
  // --focus-ring used to be a static per-mode value in that same CSS block
  // (#00E87A for dark, #1A7FC1 for light) -- a leftover from when dark always
  // meant forest and light always meant clinical. Now either family can be
  // either mode, so a mode-only static color is wrong for two of the four
  // combinations; set here instead, from the live theme's own accent, so it's
  // always exactly right.
  useEffect(() => {
    document.documentElement.dataset.theme = mode
    document.documentElement.style.setProperty('--focus-ring', themes[`${themeId}-${mode}` as keyof typeof themes].accent)
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
