import type { AccentKind } from '@/types'

export interface AccentPalette {
  main: string
  bright: string
  dim: string
  rgb: string
}

export const accentPalettes: Record<AccentKind, AccentPalette> = {
  purple: { main: '#D8BE8A', bright: '#E8D6A6', dim: '#6E5F38', rgb: '216, 190, 138' },
  cyan: { main: '#829B87', bright: '#A5B8A6', dim: '#415B4E', rgb: '130, 155, 135' },
  magenta: { main: '#A8783F', bright: '#C89A60', dim: '#4A3428', rgb: '168, 120, 63' },
}