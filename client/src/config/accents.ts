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
  magenta: { main: '#C2A56C', bright: '#D8BE8A', dim: '#5C4E28', rgb: '194, 165, 108' },
}