import { createContext, useContext, useState } from 'react'

const forest = {
  id: 'forest',
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
  canvasBg:    '#F4F8FC',
  cardBg:      '#FFFFFF',
  cardBorder:  '#DDE8F5',
  accent:      '#1A7FC1',
  accentDark:  '#0E5A8A',
  accentBg:    '#E6F1FB',
  accentBgMid: 'rgba(26,127,193,0.12)',
  accentBorder:'rgba(26,127,193,0.30)',
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

interface ThemeCtx { theme: Theme; themeId: string; toggleTheme: () => void }

const Ctx = createContext<ThemeCtx>({ theme: forest, themeId: 'forest', toggleTheme: () => {} })

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeId, setThemeId] = useState<'forest' | 'clinical'>('forest')
  return (
    <Ctx.Provider value={{ theme: themes[themeId], themeId, toggleTheme: () => setThemeId(id => id === 'forest' ? 'clinical' : 'forest') }}>
      {children}
    </Ctx.Provider>
  )
}

export const useTheme = () => useContext(Ctx)
