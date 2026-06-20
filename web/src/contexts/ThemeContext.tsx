'use client'
import { createContext, useContext, useState, ReactNode } from 'react'

export const themes = {
  forest: {
    id: 'forest' as const,
    bg:           '#0A0F0D',
    bgAlt:        '#0D1410',
    card:         '#111915',
    cardAlt:      '#161D19',
    border:       'rgba(255,255,255,0.07)',
    borderMed:    'rgba(255,255,255,0.11)',
    borderDark:   'rgba(255,255,255,0.16)',
    sidebar:      '#061208',
    sidebarHov:   '#0C1C10',
    accent:       '#00E87A',
    accentLight:  'rgba(0,232,122,0.14)',
    accentMid:    'rgba(0,232,122,0.10)',
    accentBorder: 'rgba(0,232,122,0.28)',
    text:         '#E8F5EE',
    textSub:      '#6AAE8A',
    textMuted:    '#3D6050',
    red:          '#F07070',
    redLight:     'rgba(226,75,74,0.14)',
    amber:        '#EF9F27',
    amberLight:   'rgba(239,159,39,0.14)',
    blue:         '#85B7EB',
    blueLight:    'rgba(55,138,221,0.14)',
    purple:       '#B49CF0',
    purpleLight:  'rgba(140,100,240,0.14)',
    rowAlt:       '#131A16',
    toggleTrack:  'rgba(0,232,122,0.20)',
    toggleThumb:  '#00E87A',
  },
  clinical: {
    id: 'clinical' as const,
    bg:           '#F4F8FC',
    bgAlt:        '#EEF4FA',
    card:         '#FFFFFF',
    cardAlt:      '#F4F8FC',
    border:       '#DDE8F5',
    borderMed:    '#C0D4E8',
    borderDark:   '#A8C4E0',
    sidebar:      '#0C2A4A',
    sidebarHov:   '#13395E',
    accent:       '#1A7FC1',
    accentLight:  '#E6F1FB',
    accentMid:    'rgba(26,127,193,0.12)',
    accentBorder: 'rgba(26,127,193,0.30)',
    text:         '#0C2A4A',
    textSub:      '#2A5070',
    textMuted:    '#6A8FAA',
    red:          '#E03E3E',
    redLight:     '#FEF0F0',
    amber:        '#C47F00',
    amberLight:   '#FEF8E7',
    blue:         '#1A5FAB',
    blueLight:    '#EEF4FC',
    purple:       '#5C35A8',
    purpleLight:  '#F2EEFF',
    rowAlt:       '#FAFCFB',
    toggleTrack:  'rgba(26,127,193,0.20)',
    toggleThumb:  '#1A7FC1',
  },
}

export type Theme = typeof themes.forest | typeof themes.clinical
export type ThemeId = 'forest' | 'clinical'

interface ThemeContextValue {
  theme: Theme
  themeId: ThemeId
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: themes.clinical,
  themeId: 'clinical',
  toggleTheme: () => {},
})

export const useTheme = () => useContext(ThemeContext)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeId] = useState<ThemeId>('clinical')
  return (
    <ThemeContext.Provider value={{
      theme: themes[themeId],
      themeId,
      toggleTheme: () => setThemeId(id => id === 'forest' ? 'clinical' : 'forest'),
    }}>
      {children}
    </ThemeContext.Provider>
  )
}
