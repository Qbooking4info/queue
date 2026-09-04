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
  // Not the same RGB as accentBg above -- these are built from accentDark
  // (0,194,101), which several screens' hand-rolled "Approve" buttons already
  // tinted their bg/border from at exactly these opacities. Named `success`
  // since that's the actual semantic (a positive/approve action), even though it
  // happens to reuse the theme's own darker accent shade rather than a universal
  // green -- in clinical below, accentDark is a blue, and successSubtle/Border
  // follow it there too, preserving whatever that button already looked like
  // rather than introducing a third, always-green hue no existing screen used.
  successSubtle: 'rgba(0,194,101,0.12)',
  successBorder: 'rgba(0,194,101,0.3)',
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
  // Tint/border variants at the opacities screens actually reach for, not an invented
  // ramp. Real usage of rgba(255,92,92,*) alone spanned 14 distinct opacity values
  // (0.06 through 0.8); these four are the ones with a real cluster behind them --
  // dangerBg reuses the SAME 0.14 the statusX trios below already use for bg (exact
  // match, not a new number), dangerSubtle/Border/Strong pick each cluster's dominant
  // value (0.1, 0.3, 0.4). A handful of clear outliers (0.15/0.2/0.7/0.8, ~8 call
  // sites, most likely full-screen backdrop dims, not brand-color tints) are
  // deliberately left as their own literals rather than forced onto a nearby tier.
  dangerBg:      'rgba(255,92,92,0.14)',
  dangerSubtle:  'rgba(255,92,92,0.1)',
  dangerBorder:  'rgba(255,92,92,0.3)',
  dangerStrong:  'rgba(255,92,92,0.4)',
  infoBg:        'rgba(91,158,255,0.14)',
  infoSubtle:    'rgba(91,158,255,0.12)',
  infoBorder:    'rgba(91,158,255,0.3)',
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
  successSubtle: 'rgba(14,90,138,0.12)',
  successBorder: 'rgba(14,90,138,0.3)',
  // '#DC2626' isn't invented for this -- it's already the exact literal one mobile
  // screen (AppointmentDetailScreen) and multiple web dashboard pages independently
  // reached for as "the readable red on a light background", so it's a documented
  // choice, not a guess.
  danger:      '#DC2626',
  info:        '#5B9EFF',
  // Same opacities as forest, but built from clinical's OWN solid danger RGB
  // (220,38,38, i.e. #DC2626) rather than forest's -- these never existed as literals
  // in light mode before (every existing occurrence was a dark-mode-only literal), so
  // rather than washing out forest's brighter red at low opacity against a white
  // background, this follows the same forest/clinical relationship already
  // established by danger's own solid value and by every statusX pair below.
  dangerBg:      'rgba(220,38,38,0.14)',
  dangerSubtle:  'rgba(220,38,38,0.1)',
  dangerBorder:  'rgba(220,38,38,0.3)',
  dangerStrong:  'rgba(220,38,38,0.4)',
  infoBg:        'rgba(91,158,255,0.14)',
  infoSubtle:    'rgba(91,158,255,0.12)',
  infoBorder:    'rgba(91,158,255,0.3)',
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
