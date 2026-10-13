'use client'
import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

// Structural scale, not color -- identical across both palettes, and numerically
// mirrored in packages/shared/contexts/ThemeContext.tsx's own `scale` (mobile) so a
// card or button is the same size on web and mobile even though the two token
// systems aren't code-shared (web isn't in the npm workspace @queue/shared lives in).
const scale = {
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 },
  radius:  { sm: 10, md: 14, lg: 20, pill: 99 },
  font:    { xs: 11, sm: 12, base: 13, md: 14, lg: 16, xl: 18, title: 22, hero: 26 },
}

// v3.1 palette (docs/handoff/QUEUE_V3_1_HANDOFF.md, "Design tokens"). Ids stay
// 'forest' (dark) and 'clinical' (light) so saved preferences and every page keep
// working; mirrored by packages/shared/contexts/ThemeContext.tsx on mobile.
export const themes = {
  forest: {
    id: 'forest' as const,
    ...scale,
    bg:           '#081416',
    bgAlt:        '#0B1A1C',
    card:         '#0F2326',
    cardAlt:      '#132B2E',
    border:       'rgba(232,241,240,0.08)',
    borderMed:    'rgba(232,241,240,0.12)',
    borderDark:   'rgba(232,241,240,0.18)',
    sidebar:      '#06100F',
    sidebarHov:   '#0F2326',
    accent:       '#2DD4BF',
    accentLight:  'rgba(45,212,191,0.14)',
    accentDark:   '#5EEAD4',
    accentMid:    'rgba(45,212,191,0.10)',
    accentBorder: 'rgba(45,212,191,0.30)',
    text:         '#E8F1F0',
    textSub:      '#B8C7C9',
    textMuted:    '#94A3A6',
    red:          '#F87171',
    redLight:     'rgba(248,113,113,0.14)',
    amber:        '#FBBF24',
    amberLight:   'rgba(251,191,36,0.14)',
    blue:         '#93C5FD',
    blueLight:    'rgba(96,165,250,0.14)',
    info:         '#60A5FA',
    infoBg:       'rgba(96,165,250,0.14)',
    infoSubtle:   'rgba(96,165,250,0.12)',
    infoBorder:   'rgba(96,165,250,0.3)',
    // v3.1 has no purple; pending_review now reads as warning. Kept as aliases of amber
    // so existing pages compile and render in the warning colour.
    purple:       '#FBBF24',
    purpleLight:  'rgba(251,191,36,0.14)',
    rowAlt:       '#0C1E21',
    toggleTrack:  'rgba(45,212,191,0.25)',
    toggleThumb:  '#2DD4BF',
  },
  clinical: {
    id: 'clinical' as const,
    ...scale,
    bg:           '#F8FAFC',
    bgAlt:        '#F1F5F4',
    card:         '#FFFFFF',
    cardAlt:      '#F8FAFC',
    border:       '#E3ECEB',
    borderMed:    '#CFDDDB',
    borderDark:   '#B5C8C5',
    sidebar:      '#134E4A',
    sidebarHov:   '#0F766E',
    accent:       '#0F766E',
    accentLight:  '#E6F4F2',
    accentDark:   '#134E4A',
    accentMid:    'rgba(15,118,110,0.10)',
    accentBorder: 'rgba(15,118,110,0.30)',
    text:         '#0B1B1E',
    textSub:      '#33464A',
    textMuted:    '#4B5B5E',
    red:          '#B91C1C',
    redLight:     '#FEE2E2',
    amber:        '#B45309',
    amberLight:   '#FEF3C7',
    blue:         '#1D4ED8',
    blueLight:    '#DBEAFE',
    info:         '#2563EB',
    infoBg:       'rgba(37,99,235,0.12)',
    infoSubtle:   'rgba(37,99,235,0.08)',
    infoBorder:   'rgba(37,99,235,0.3)',
    purple:       '#B45309',
    purpleLight:  '#FEF3C7',
    rowAlt:       '#FAFCFC',
    toggleTrack:  'rgba(15,118,110,0.20)',
    toggleThumb:  '#0F766E',
  },
}

export type Theme = typeof themes.forest | typeof themes.clinical
export type ThemeId = 'forest' | 'clinical'

export type ThemePreference = 'light' | 'dark' | 'system'

interface ThemeContextValue {
  theme: Theme
  themeId: ThemeId
  /** What the user picked; 'system' follows the OS setting. */
  preference: ThemePreference
  setPreference: (p: ThemePreference) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: themes.clinical,
  themeId: 'clinical',
  preference: 'system',
  setPreference: () => {},
  toggleTheme: () => {},
})

export const useTheme = () => useContext(ThemeContext)

const STORAGE_KEY = 'qb_dashboard_theme'

// Stored values: 'light' | 'dark' | 'system'. Older builds stored the theme ids
// 'clinical' / 'forest'; those read back as light / dark.
function readPreference(): ThemePreference {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'light' || v === 'clinical') return 'light'
    if (v === 'dark' || v === 'forest') return 'dark'
  } catch { /* storage blocked: fall through */ }
  return 'system'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>('system')
  const [systemDark, setSystemDark] = useState(false)

  useEffect(() => {
    setPreferenceState(readPreference())
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    setSystemDark(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const themeId: ThemeId = (preference === 'dark' || (preference === 'system' && systemDark)) ? 'forest' : 'clinical'

  // Mirror the active theme onto the document as data-theme, so plain CSS
  // (globals.css skeleton shimmer, etc.) can react to it too. Written in an effect
  // so the server render and the first client render stay identical.
  useEffect(() => {
    document.documentElement.dataset.theme = themeId === 'forest' ? 'dark' : 'light'
  }, [themeId])

  const setPreference = (p: ThemePreference) => {
    setPreferenceState(p)
    try { localStorage.setItem(STORAGE_KEY, p) } catch { /* not persisted */ }
  }
  const toggleTheme = () => setPreference(themeId === 'forest' ? 'light' : 'dark')

  return (
    <ThemeContext.Provider value={{ theme: themes[themeId], themeId, preference, setPreference, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}
