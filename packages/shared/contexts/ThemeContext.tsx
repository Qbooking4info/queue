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

const forest = {
  id: 'forest',
  ...scale,
  canvasBg:    '#0A0F0D',
  cardBg:      '#111915',
  cardBorder:  'rgba(255,255,255,0.07)',
  accent:      '#00E87A',
  accentDark:  '#00C265',
  accentBg:    'rgba(0,232,122,0.12)',
  accentBgMid: 'rgba(0,232,122,0.08)',
  accentBorder:'rgba(0,232,122,0.28)',
  textPrimary: '#E8F5EE',
  textSecondary:'#7ABDA0',
  textMuted:   '#4A7060',
  // Solid semantic colors for buttons/icons/banners -- distinct from the statusX
  // trios below, which are specifically for queue-status badges (bg+text+border at
  // one fixed opacity). danger/info were never named before this: every screen that
  // needed an alert red or an info blue just retyped the same literal. forest's value
  // here is the exact literal that was already the de facto standard (zero visual
  // change); info is identical in both palettes because '#5B9EFF' was already proven
  // to read fine on both a dark mobile screen and a white web dashboard card.
  danger:      '#FF5C5C',
  info:        '#5B9EFF',
  statusOpen:     { bg:'rgba(0,232,122,0.14)',  text:'#5DCAA5', border:'rgba(0,232,122,0.28)' },
  statusBusy:     { bg:'rgba(239,159,39,0.14)', text:'#EF9F27', border:'rgba(239,159,39,0.28)' },
  statusVirtual:  { bg:'rgba(55,138,221,0.14)', text:'#85B7EB', border:'rgba(55,138,221,0.28)' },
  statusCancelled:{ bg:'rgba(226,75,74,0.14)',  text:'#F09595', border:'rgba(226,75,74,0.28)' },
  bannerBg:    '#0A1A0F',
  bannerBorder:'rgba(0,232,122,0.22)',
  inputBg:     '#161D19',
  inputBorder: 'rgba(255,255,255,0.09)',
  starColor:   '#EF9F27',
  splashBg:    '#061208',
}

const clinical = {
  id: 'clinical',
  ...scale,
  canvasBg:    '#F4F8FC',
  cardBg:      '#FFFFFF',
  cardBorder:  '#DDE8F5',
  accent:      '#1A7FC1',
  accentDark:  '#0E5A8A',
  accentBg:    '#E6F1FB',
  accentBgMid: 'rgba(26,127,193,0.12)',
  accentBorder:'rgba(26,127,193,0.30)',
  // '#DC2626' isn't invented for this -- it's already the exact literal one mobile
  // screen (AppointmentDetailScreen) and multiple web dashboard pages independently
  // reached for as "the readable red on a light background", so it's a documented
  // choice, not a guess.
  danger:      '#DC2626',
  info:        '#5B9EFF',
  textPrimary: '#0C2A4A',
  textSecondary:'#2A5070',
  textMuted:   '#6A8FAA',
  statusOpen:     { bg:'#E6F7EE', text:'#085041', border:'rgba(0,168,84,0.3)' },
  statusBusy:     { bg:'#FEF8E7', text:'#633806', border:'rgba(196,127,0,0.3)' },
  statusVirtual:  { bg:'#E6F1FB', text:'#0C447C', border:'rgba(26,95,165,0.3)' },
  statusCancelled:{ bg:'#FCEBEB', text:'#791F1F', border:'rgba(163,45,45,0.3)' },
  bannerBg:    '#0C2A4A',
  bannerBorder:'rgba(26,127,193,0.30)',
  inputBg:     '#F4F8FC',
  inputBorder: '#C0D4E8',
  starColor:   '#C47F00',
  splashBg:    '#0C2A4A',
}

export type Theme = typeof forest
export const themes = { forest, clinical } as const

const THEME_STORAGE_KEY = 'queue:theme'

interface ThemeCtx { theme: Theme; themeId: string; toggleTheme: () => void }

const Ctx = createContext<ThemeCtx>({ theme: forest, themeId: 'forest', toggleTheme: () => {} })

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeId] = useState<'forest' | 'clinical'>('forest')

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
