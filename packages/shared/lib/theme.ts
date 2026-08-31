export const dark = {
  mode:         'dark' as const,
  bg:           '#0A0F0D',
  bgCanvas:     '#060A07',
  bgCard:       '#111915',
  bgCardAlt:    '#161D19',
  accent:       '#00E87A',
  accentDim:    '#00C265',
  accentMuted:  'rgba(0,232,122,0.12)',
  accentBorder: 'rgba(0,232,122,0.25)',
  text:         '#F0F5F2',
  textSub:      '#7A9089',
  textMuted:    '#4A6058',
  border:       'rgba(255,255,255,0.07)',
  borderMed:    'rgba(255,255,255,0.12)',
  red:          '#FF5C5C',
  amber:        '#FFB547',
  blue:         '#5B9EFF',
}

export const light = {
  mode:         'light' as const,
  bg:           '#FFFFFF',
  bgCanvas:     '#F4F7F5',
  bgCard:       '#FFFFFF',
  bgCardAlt:    '#F0F5F2',
  accent:       '#00A854',
  accentDim:    '#008A44',
  accentMuted:  'rgba(0,168,84,0.10)',
  accentBorder: 'rgba(0,168,84,0.30)',
  text:         '#0D1F17',
  textSub:      '#4A7060',
  textMuted:    '#8AADA0',
  border:       'rgba(0,0,0,0.08)',
  borderMed:    'rgba(0,0,0,0.14)',
  red:          '#E03E3E',
  amber:        '#C47F00',
  blue:         '#2266CC',
}

export type Theme = typeof dark

export const spacing = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32,
}

export const radius = {
  sm: 8, md: 12, lg: 16, xl: 20, full: 999,
}

export const font = {
  xs: 11, sm: 12, base: 14, md: 15, lg: 17, xl: 20, xxl: 24, xxxl: 32,
}
