import { useEffect, useState } from 'react'
import { API_BASE_URL, resolveImageUrl } from '@/config/api'
import { imageAssets } from '@/config/images'
import { properties as fallbackProperties } from '@/data/properties'
import type {
  AccentKind,
  Property,
  PropertyApiImage,
  PropertyImage,
  PropertySlug,
  PropertySpaceAttribute,
  VisualKind,
} from '@/types'

/**
 * Public properties service.
 *
 * The catalogue that previously lived only in `client/src/data/properties.ts`
 * is now editable by admins, so the public store is loaded from the API:
 *
 *   GET /api/properties  → DB-driven property list (incl. `beds`)
 *
 * The static `data/properties.ts` file stays as the offline fallback so the
 * site keeps working (and renders instantly) even if the API is slow or down.
 * Images are always attached from `src/config/images.ts` keyed by slug.
 */

interface PublicPropertyApiItem {
  id: string
  slug: string
  name: string
  shortLabel: string
  description: string
  shortDescription: string
  capacity: number
  minGuests: number
  maxGuests: number
  bedrooms: number
  beds: number | null
  bathrooms: number
  sqft: number
  amenities: string[]
  accent: string
  visual: string
  location: string | null
  /** Nightly rate in integer paise (₹3,000 → 300000). Phase 5. */
  pricePerNightPaise: number
  discountedPricePerNightPaise: number | null
  /** DB-backed images (Phase 5), shaped exactly like the public serializer. */
  images: PropertyApiImage[]
  /** Admin-configured THE SPACE attribute cards, ordered by sort. */
  spaceAttributes: PropertySpaceAttribute[]
}

function isAccent(value: string): value is AccentKind {
  return value === 'purple' || value === 'cyan' || value === 'magenta'
}

function isVisual(value: string): value is VisualKind {
  return value === 'moon' || value === 'dawn' || value === 'evening'
}

/** Canonical gallery order for admin-uploaded slots (MAIN → sub1–3 → extra). */
const GALLERY_KIND_ORDER: Record<string, number> = {
  MAIN: 0,
  SUB1: 1,
  SUB2: 2,
  SUB3: 3,
  EXTRA: 4,
}

/**
 * Convert DB-backed photos into the gallery shape. When a property has any
 * uploadable images they take over the gallery entirely (old static artwork is
 * only a fallback for properties with no uploads), preserving slot order.
 * Image URLs are resolved through the API base config first; unresolvable ones
 * (e.g. the dev-only `memory://` scheme) are dropped so the static artwork can
 * step in instead of a broken <img>.
 */
function buildDbGallery(images: PropertyApiImage[], accent: AccentKind): PropertyImage[] {
  return [...images]
    .sort(
      (a, b) => (GALLERY_KIND_ORDER[a.kind] ?? 9) - (GALLERY_KIND_ORDER[b.kind] ?? 9) || a.sort - b.sort
    )
    .map((img) => ({
      id: img.id,
      label: img.alt || 'AURA HOMES property photo',
      image: resolveImageUrl(img.url),
      accent,
      variant: 'moon' as VisualKind,
    }))
    .filter((slide): slide is PropertyImage => slide.image !== null)
}

function toProperty(item: PublicPropertyApiItem): Property {
  const assets = imageAssets.properties[item.slug as PropertySlug]
  const accent: AccentKind = isAccent(item.accent) ? item.accent : 'purple'
  const visual: VisualKind = isVisual(item.visual) ? item.visual : 'moon'
  const dbImages: PropertyApiImage[] = item.images ?? []
  const mainDb = dbImages.find((img) => img.kind === 'MAIN')
  const mainImage = mainDb ? resolveImageUrl(mainDb.url) : null
  const dbGallery = dbImages.length > 0 ? buildDbGallery(dbImages, accent) : []
  return {
    id: item.id,
    slug: item.slug as PropertySlug,
    name: item.name,
    shortLabel: item.shortLabel,
    description: item.description,
    shortDescription: item.shortDescription,
    pricePerNightPaise: item.pricePerNightPaise,
    discountedPricePerNightPaise: item.discountedPricePerNightPaise ?? null,
    images: item.images,
    image: mainImage ?? assets?.mainImage ?? null,
    gallery: dbGallery.length > 0 ? dbGallery : (assets?.gallery ?? []),
    accent,
    visual,
    capacity: item.capacity,
    minGuests: item.minGuests,
    maxGuests: item.maxGuests,
    bedrooms: item.bedrooms,
    beds: item.beds ?? undefined,
    bathrooms: item.bathrooms,
    sqft: item.sqft,
    amenities: item.amenities,
    location: item.location,
    spaceAttributes: item.spaceAttributes ?? [],
  }
}

let cached: Property[] | null = null

export async function loadProperties(): Promise<Property[]> {
  if (cached) return cached
  try {
    const response = await fetch(`${API_BASE_URL}/api/properties`)
    if (!response.ok) throw new Error(`Properties API returned ${response.status}`)
    const json = (await response.json()) as { properties?: PublicPropertyApiItem[] }
    const items = (json.properties ?? []).map(toProperty)
    cached = items
    return items
  } catch {
    cached = fallbackProperties
    return cached
  }
}

export interface PropertiesState {
  items: Property[]
  /** `loading` until the first API response resolves; static data renders meanwhile. */
  status: 'loading' | 'ready'
}

export function useProperties(): PropertiesState {
  const [state, setState] = useState<PropertiesState>({
    items: fallbackProperties,
    status: 'loading',
  })

  useEffect(() => {
    let active = true
    loadProperties().then((items) => {
      if (active) setState({ items, status: 'ready' })
    })
    return () => {
      active = false
    }
  }, [])

  return state
}

export function usePropertyBySlug(slug: string | undefined): {
  property: Property | undefined
  status: 'loading' | 'ready'
  /** True once the API has answered AND the slug did not resolve to a home. */
  isMissing: boolean
} {
  const { items, status } = useProperties()
  const property = slug ? items.find((item) => item.slug === slug) : undefined
  const isMissing = slug !== undefined && status === 'ready' && !items.some((item) => item.slug === slug)
  return { property, status, isMissing }
}