import type { AccentKind } from '@/types'

export interface AccentPalette {
  main: string
  bright: string
  dim: string
  rgb: string
}

export const accentPalettes: Record<AccentKind, AccentPalette> = {
  purple: { main: '#a8783f', bright: '#d2a466', dim: '#5b411f', rgb: '168, 120, 63' },
  cyan: { main: '#c18a34', bright: '#e0b265', dim: '#6a4a20', rgb: '193, 138, 52' },
  magenta: { main: '#a9553a', bright: '#ce7d56', dim: '#542818', rgb: '169, 85, 58' },
}