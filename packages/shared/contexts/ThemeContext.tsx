import { createContext, useContext, useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

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
const forest = {
  id: 'forest',
  ...scale,
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
export const themes = { forest, clinical } as const

const THEME_STORAGE_KEY = 'queue:theme'

interface ThemeCtx { theme: Theme; themeId: string; toggleTheme: () => void }

const Ctx = createContext<ThemeCtx>({ theme: clinical, themeId: 'clinical', toggleTheme: () => {} })

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeId] = useState<'forest' | 'clinical'>('clinical')

  // MM6: Load persisted theme preference on startup
  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY).then(saved => {
      if (saved === 'forest' || saved === 'clinical') {
        setThemeId(saved)
      }
    }).catch(() => {/* ignore storage errors */})
  }, [])

  function toggleTheme() {
    setThemeId(prev => {
      const next: 'forest' | 'clinical' = prev === 'forest' ? 'clinical' : 'forest'
      // MM6: Persist new theme preference
      AsyncStorage.setItem(THEME_STORAGE_KEY, next).catch(() => {/* ignore storage errors */})
      return next
    })
  }

  return (
    <Ctx.Provider value={{ theme: themes[themeId], themeId, toggleTheme }}>
      {children}
    </Ctx.Provider>
  )
}

export const useTheme = () => useContext(Ctx)
