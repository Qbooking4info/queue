import { createContext, useContext, useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { queuePalettes, brand, type QTokens } from '../theme/queueTokens'

// Structural scale, not color -- identical across both palettes on purpose, and
// mirrored (same numeric values) in web/src/contexts/ThemeContext.tsx's own `scale`
// so a card or button reads as the same size on web and mobile even though the two
// token systems aren't code-shared. Values were picked to match the modes actually
// in use across screens today (fontSize clustered hardest at 11/12/13/14, borderRadius
// at 10/14/20/99), not invented from scratch -- the goal is a named home for the
// numbers already being reached for, not new numbers nobody was using.
const scale = {
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 },
  radius:  { sm: 10, md: 14, lg: 20, pill: 99 },
  font:    { xs: 11, sm: 12, base: 13, md: 14, lg: 16, xl: 18, title: 22, hero: 26 },
}

// v3.1 palette (docs/handoff/QUEUE_V3_1_HANDOFF.md, "Design tokens"). The ids stay
// 'forest' (dark) and 'clinical' (light) so every screen and saved preference keeps
// working; only the values changed. Light is now the default.
// The v4 handoff speaks in its own token names (surface/ink70/sel/field/...).
// forest and clinical predate it, so each carries a `q` block that maps those
// names onto the colours it already uses. That keeps the Theme shape identical
// across all four palettes, so a component written for either vocabulary works
// on any of them -- which is what lets the four apps be redesigned one at a
// time instead of all at once.
const forestQ: QTokens = {
  bg: '#081416', surface: '#0F2326', elev: '#0F2326',
  ink: '#E8F1F0', ink70: '#B8C7C9', ink60: '#94A3A6',
  teal: '#5EEAD4', primary: '#2DD4BF', onPrimary: '#042F2E',
  red: '#F87171', redFill: '#EF4444', redBg: 'rgba(248,113,113,0.14)',
  amber: '#FBBF24', amberFill: '#D97706', amberBg: 'rgba(251,191,36,0.14)',
  green: '#4ADE80', greenFill: '#10B981', greenBg: 'rgba(74,222,128,0.14)',
  muted: 'rgba(148,163,166,0.14)', sel: 'rgba(45,212,191,0.14)',
  field: '#0F2326', tab: '#0F2326', map: '#0B1D1F', road: '#17383B',
  line: 'rgba(232,241,240,0.08)',
}

const clinicalQ: QTokens = {
  bg: '#F8FAFC', surface: '#FFFFFF', elev: '#FFFFFF',
  ink: '#0B1B1E', ink70: '#33464A', ink60: '#4B5B5E',
  teal: '#134E4A', primary: '#0F766E', onPrimary: '#FFFFFF',
  red: '#B91C1C', redFill: '#EF4444', redBg: 'rgba(239,68,68,0.14)',
  amber: '#B45309', amberFill: '#F59E0B', amberBg: '#FEF3C7',
  green: '#15803D', greenFill: '#16A34A', greenBg: '#DCFCE7',
  muted: '#F1F5F9', sel: '#E6F4F2', field: '#FFFFFF', tab: '#FFFFFF',
  map: '#E2E8E7', road: '#FFFFFF',
  line: '#E3ECEB',
}

const forest = {
  id: 'forest',
  ...scale,
  q: forestQ,
  brand,
  isDark: true,
  canvasBg:    '#081416',
  cardBg:      '#0F2326',
  cardBorder:  'rgba(232,241,240,0.08)',
  accent:      '#2DD4BF',
  accentDark:  '#5EEAD4',
  accentBg:    'rgba(45,212,191,0.14)',
  accentBgMid: 'rgba(45,212,191,0.08)',
  successSubtle: 'rgba(74,222,128,0.12)',
  successBorder: 'rgba(74,222,128,0.3)',
  accentBorder:'rgba(45,212,191,0.30)',
  textPrimary: '#E8F1F0',
  textSecondary:'#B8C7C9',
  textMuted:   '#94A3A6',
  danger:      '#F87171',
  info:        '#60A5FA',
  dangerBg:      'rgba(248,113,113,0.14)',
  dangerSubtle:  'rgba(248,113,113,0.1)',
  dangerBorder:  'rgba(248,113,113,0.3)',
  dangerStrong:  'rgba(248,113,113,0.4)',
  infoBg:        'rgba(96,165,250,0.14)',
  infoSubtle:    'rgba(96,165,250,0.12)',
  infoBorder:    'rgba(96,165,250,0.3)',
  // Status map (v3.1): pending=warning, confirmed=primary, checked_in=blue,
  // in_progress=primaryDeep, completed=success, cancelled/no_show=neutral.
  statusOpen:     { bg:'rgba(45,212,191,0.14)',  text:'#5EEAD4', border:'rgba(45,212,191,0.3)' },
  statusBusy:     { bg:'rgba(251,191,36,0.14)',  text:'#FBBF24', border:'rgba(251,191,36,0.3)' },
  statusVirtual:  { bg:'rgba(96,165,250,0.14)',  text:'#93C5FD', border:'rgba(96,165,250,0.3)' },
  statusCancelled:{ bg:'rgba(148,163,166,0.14)', text:'#B8C7C9', border:'rgba(148,163,166,0.3)' },
  statusApproval: { bg:'rgba(251,191,36,0.14)',  text:'#FBBF24', border:'rgba(251,191,36,0.3)' },
  statusProgress: { bg:'#134E4A',                text:'#E8F1F0', border:'rgba(45,212,191,0.3)' },
  statusNeutral:  { bg:'rgba(148,163,166,0.14)', text:'#B8C7C9', border:'rgba(148,163,166,0.3)' },
  statusSuccess:  { bg:'rgba(74,222,128,0.14)',  text:'#4ADE80', border:'rgba(74,222,128,0.3)' },
  bannerBg:    '#0F2326',
  bannerBorder:'rgba(45,212,191,0.22)',
  inputBg:     '#0F2326',
  inputBorder: 'rgba(232,241,240,0.12)',
  starColor:   '#FBBF24',
  splashBg:    '#081416',
}

const clinical = {
  id: 'clinical',
  ...scale,
  q: clinicalQ,
  brand,
  isDark: false,
  canvasBg:    '#F8FAFC',
  cardBg:      '#FFFFFF',
  cardBorder:  '#E3ECEB',
  accent:      '#0F766E',
  accentDark:  '#134E4A',
  accentBg:    '#E6F4F2',
  accentBgMid: 'rgba(15,118,110,0.10)',
  accentBorder:'rgba(15,118,110,0.30)',
  successSubtle: 'rgba(22,163,74,0.12)',
  successBorder: 'rgba(22,163,74,0.3)',
  // dangerText / blue from the token set: both clear 4.5:1 on white.
  danger:      '#B91C1C',
  info:        '#2563EB',
  dangerBg:      'rgba(239,68,68,0.14)',
  dangerSubtle:  'rgba(239,68,68,0.1)',
  dangerBorder:  'rgba(239,68,68,0.3)',
  dangerStrong:  'rgba(239,68,68,0.4)',
  infoBg:        'rgba(37,99,235,0.12)',
  infoSubtle:    'rgba(37,99,235,0.08)',
  infoBorder:    'rgba(37,99,235,0.3)',
  textPrimary: '#0B1B1E',
  textSecondary:'#33464A',
  textMuted:   '#4B5B5E',
  statusOpen:     { bg:'#E6F4F2', text:'#0F766E', border:'rgba(15,118,110,0.3)' },
  statusBusy:     { bg:'#FEF3C7', text:'#B45309', border:'rgba(245,158,11,0.35)' },
  statusVirtual:  { bg:'#DBEAFE', text:'#1D4ED8', border:'rgba(37,99,235,0.3)' },
  statusCancelled:{ bg:'#F1F5F9', text:'#4B5563', border:'rgba(107,114,128,0.3)' },
  statusApproval: { bg:'#FEF3C7', text:'#B45309', border:'rgba(245,158,11,0.35)' },
  statusProgress: { bg:'#134E4A', text:'#FFFFFF', border:'#134E4A' },
  statusNeutral:  { bg:'#F1F5F9', text:'#4B5563', border:'rgba(107,114,128,0.3)' },
  statusSuccess:  { bg:'#DCFCE7', text:'#15803D', border:'rgba(22,163,74,0.3)' },
  bannerBg:    '#134E4A',
  bannerBorder:'rgba(15,118,110,0.30)',
  inputBg:     '#FFFFFF',
  inputBorder: '#E3ECEB',
  starColor:   '#B45309',
  splashBg:    '#134E4A',
}

export type Theme = typeof forest
export const themes = { forest, clinical, ...queuePalettes } as const
export type ThemeId = keyof typeof themes

/**
 * A light/dark pair an app renders in. Passed to ThemeProvider so each app can
 * move to the v4 handoff palettes on its own schedule; the default stays the
 * v3.1 pair so an app that passes nothing is unchanged.
 */
export interface PalettePair { light: Theme; dark: Theme }

export const V3_PALETTES: PalettePair = { light: clinical, dark: forest }
export const V4_PALETTES: PalettePair = { light: queuePalettes.paper, dark: queuePalettes.ink }

const THEME_STORAGE_KEY = 'queue:theme'

interface ThemeCtx {
  theme: Theme
  themeId: string
  /** 'light' | 'dark' -- which half of the pair is showing, regardless of palette set. */
  mode: 'light' | 'dark'
  toggleTheme: () => void
}

const Ctx = createContext<ThemeCtx>({ theme: clinical, themeId: 'clinical', mode: 'light', toggleTheme: () => {} })

interface ProviderProps {
  children: React.ReactNode
  /** Defaults to the v3.1 pair (clinical/forest). */
  palettes?: PalettePair
  /** Which half to show before anything is stored. */
  defaultMode?: 'light' | 'dark'
}

export function ThemeProvider({ children, palettes = V3_PALETTES, defaultMode = 'light' }: ProviderProps) {
  const [mode, setMode] = useState<'light' | 'dark'>(defaultMode)

  // MM6: Load persisted theme preference on startup.
  //
  // The stored value is a palette id ('clinical', 'forest', 'paper', 'ink'),
  // written by older builds too. Resolve it to a MODE rather than to a palette:
  // a phone that stored 'forest' under the v3.1 patient app must come back as
  // dark on the v4 palettes, not as the v3.1 dark palette inside a v4 app.
  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY).then(saved => {
      if (saved === 'forest' || saved === 'ink') setMode('dark')
      else if (saved === 'clinical' || saved === 'paper') setMode('light')
    }).catch(() => {/* ignore storage errors */})
  }, [])

  function toggleTheme() {
    setMode(prev => {
      const next = prev === 'dark' ? 'light' : 'dark'
      // MM6: Persist new theme preference
      AsyncStorage.setItem(THEME_STORAGE_KEY, palettes[next].id).catch(() => {/* ignore storage errors */})
      return next
    })
  }

  const theme = palettes[mode]

  return (
    <Ctx.Provider value={{ theme, themeId: theme.id, mode, toggleTheme }}>
      {children}
    </Ctx.Provider>
  )
}

export const useTheme = () => useContext(Ctx)
