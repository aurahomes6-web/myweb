import type { PropertyImage, PropertySlug } from '@/types'

/**
 * Centralized image registry for AURA HOMES.
 *
 * Replace the `null` path values below with real photos placed in
 * `client/public/images/` (e.g. '/images/penthouse-1.jpg'). No component edits
 * are required — the gallery and property visuals automatically render the
 * photograph once a path is set, and fall back to the premium SVG artwork while
 * the path is `null`.
 */
export const imageAssets = {
  hero: null as string | null,
  properties: {
    'aura-cozy-penthouse-1': {
      mainImage: null as string | null,
      gallery: [
        {
          id: 'p1-1',
          label: 'Living space with panoramic views',
          image: null,
          accent: 'purple',
          variant: 'moon',
        },
        {
          id: 'p1-2',
          label: 'Master bedroom at dusk',
          image: null,
          accent: 'purple',
          variant: 'dawn',
        },
        {
          id: 'p1-3',
          label: 'Private terrace evening light',
          image: null,
          accent: 'cyan',
          variant: 'evening',
        },
        {
          id: 'p1-4',
          label: 'Interior details & finishes',
          image: null,
          accent: 'magenta',
          variant: 'dawn',
        },
      ] as PropertyImage[],
    },
    'aura-cozy-penthouse-2': {
      mainImage: null as string | null,
      gallery: [
        {
          id: 'p2-1',
          label: 'Open-plan living at first light',
          image: null,
          accent: 'cyan',
          variant: 'dawn',
        },
        {
          id: 'p2-2',
          label: 'Designer lounge in the evening',
          image: null,
          accent: 'cyan',
          variant: 'evening',
        },
        {
          id: 'p2-3',
          label: 'Bedroom with garden views',
          image: null,
          accent: 'purple',
          variant: 'moon',
        },
        {
          id: 'p2-4',
          label: 'Balcony seating area',
          image: null,
          accent: 'magenta',
          variant: 'dawn',
        },
      ] as PropertyImage[],
    },
    'aura-cozy-penthouse-3': {
      mainImage: null as string | null,
      gallery: [
        {
          id: 'p3-1',
          label: 'Warm contemporary living space',
          image: null,
          accent: 'magenta',
          variant: 'evening',
        },
        {
          id: 'p3-2',
          label: 'Dining corner with ambient light',
          image: null,
          accent: 'magenta',
          variant: 'moon',
        },
        {
          id: 'p3-3',
          label: 'Master suite with dual views',
          image: null,
          accent: 'cyan',
          variant: 'dawn',
        },
        {
          id: 'p3-4',
          label: 'Terrace at golden hour',
          image: null,
          accent: 'purple',
          variant: 'evening',
        },
      ] as PropertyImage[],
    },
  } satisfies Record<PropertySlug, { mainImage: string | null; gallery: PropertyImage[] }>,
}