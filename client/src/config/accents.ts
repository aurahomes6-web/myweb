import type { AccentKind } from '@/types'

export interface AccentPalette {
  main: string
  bright: string
  dim: string
  rgb: string
}

export const accentPalettes: Record<AccentKind, AccentPalette> = {
  purple: { main: '#a855f7', bright: '#c084fc', dim: '#6d28d9', rgb: '168, 85, 247' },
  cyan: { main: '#22d3ee', bright: '#67e8f9', dim: '#0e7490', rgb: '34, 211, 238' },
  magenta: { main: '#ec4899', bright: '#f472b6', dim: '#9d174d', rgb: '236, 72, 153' },
}