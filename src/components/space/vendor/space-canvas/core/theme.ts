export type BullseyeTone = 'good' | 'warn' | 'bad' | 'info' | 'neutral'

export type BullseyeTheme = {
  canvas: string
  card: string
  well: string
  hover: string
  border: string
  borderStrong: string
  elevation: string
  ink: string
  body: string
  muted: string
  faint: string
  accent: string
  accentSoft: string
  accentBorder: string
  good: string
  goodText: string
  goodSoft: string
  goodBorder: string
  warn: string
  warnText: string
  warnSoft: string
  warnBorder: string
  bad: string
  badText: string
  badSoft: string
  badBorder: string
  info: string
  infoText: string
  infoSoft: string
  infoBorder: string
  terminalBg: string
  terminalHeader: string
  terminalBorder: string
  terminalText: string
  terminalMuted: string
}

export const BULLSEYE_PALETTE: {
  readonly light: BullseyeTheme
  readonly dark: BullseyeTheme
} = {
  light: {
    canvas: '#faf9f6',
    card: '#ffffff',
    well: '#f4f2ed',
    hover: '#f6f4ef',
    border: '#e5e2da',
    borderStrong: '#d3cec2',
    elevation: '0 1px 2px rgba(20, 20, 19, 0.035)',
    ink: '#141413',
    body: '#44403c',
    muted: '#78716c',
    faint: '#a8a29e',
    accent: '#0d9488',
    accentSoft: 'rgba(13, 148, 136, 0.09)',
    accentBorder: 'rgba(13, 148, 136, 0.24)',
    good: '#0d9488',
    goodText: '#0f766e',
    goodSoft: 'rgba(13, 148, 136, 0.09)',
    goodBorder: 'rgba(13, 148, 136, 0.24)',
    warn: '#d97706',
    warnText: '#b45309',
    warnSoft: 'rgba(217, 119, 6, 0.09)',
    warnBorder: 'rgba(217, 119, 6, 0.25)',
    bad: '#e11d48',
    badText: '#be123c',
    badSoft: 'rgba(225, 29, 72, 0.08)',
    badBorder: 'rgba(225, 29, 72, 0.24)',
    info: '#4f46e5',
    infoText: '#4338ca',
    infoSoft: 'rgba(79, 70, 229, 0.08)',
    infoBorder: 'rgba(79, 70, 229, 0.22)',
    terminalBg: '#111318',
    terminalHeader: '#161921',
    terminalBorder: '#242834',
    terminalText: '#e4e7ec',
    terminalMuted: '#94a3b8'
  },
  dark: {
    canvas: '#0a0a0b',
    card: '#141416',
    well: '#1c1c1f',
    hover: '#232327',
    border: 'rgba(255, 255, 255, 0.07)',
    borderStrong: 'rgba(255, 255, 255, 0.1)',
    elevation: '0 1px 0 rgba(255, 255, 255, 0.04) inset, 0 8px 24px rgba(0, 0, 0, 0.35)',
    ink: '#f5f5f7',
    body: '#c7c7cc',
    muted: '#8e8e93',
    faint: '#48484a',
    accent: '#30d158',
    accentSoft: 'rgba(48, 209, 88, 0.12)',
    accentBorder: 'rgba(48, 209, 88, 0.26)',
    good: '#30d158',
    goodText: '#4ade80',
    goodSoft: 'rgba(48, 209, 88, 0.12)',
    goodBorder: 'rgba(48, 209, 88, 0.26)',
    warn: '#ff9f0a',
    warnText: '#ffb340',
    warnSoft: 'rgba(255, 159, 10, 0.12)',
    warnBorder: 'rgba(255, 159, 10, 0.26)',
    bad: '#ff453a',
    badText: '#ff6961',
    badSoft: 'rgba(255, 69, 58, 0.12)',
    badBorder: 'rgba(255, 69, 58, 0.3)',
    info: '#8e8e93',
    infoText: '#c7c7cc',
    infoSoft: 'rgba(255, 255, 255, 0.06)',
    infoBorder: 'rgba(255, 255, 255, 0.1)',
    terminalBg: '#0d0d0f',
    terminalHeader: '#141416',
    terminalBorder: 'rgba(255, 255, 255, 0.07)',
    terminalText: '#e5e5ea',
    terminalMuted: '#8e8e93'
  }
}

export function getBullseyeTheme(dark: boolean): BullseyeTheme {
  return dark ? BULLSEYE_PALETTE.dark : BULLSEYE_PALETTE.light
}
