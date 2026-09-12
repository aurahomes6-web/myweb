import { useEffect, useState } from 'react'
import { API_BASE_URL } from '@/config/api'
import { imageAssets } from '@/config/images'
import { properties as fallbackProperties } from '@/data/properties'
import type { AccentKind, Property, PropertySlug, VisualKind } from '@/types'

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
  bedrooms: number
  beds: number | null
  bathrooms: number
  sqft: number
  amenities: string[]
  accent: string
  visual: string
  location: string | null
}

function isAccent(value: string): value is AccentKind {
  return value === 'purple' || value === 'cyan' || value === 'magenta'
}

function isVisual(value: string): value is VisualKind {
  return value === 'moon' || value === 'dawn' || value === 'evening'
}

function toProperty(item: PublicPropertyApiItem): Property {
  const assets = imageAssets.properties[item.slug as PropertySlug]
  return {
    id: item.id,
    slug: item.slug as PropertySlug,
    name: item.name,
    shortLabel: item.shortLabel,
    description: item.description,
    shortDescription: item.shortDescription,
    image: assets?.mainImage ?? null,
    gallery: assets?.gallery ?? [],
    accent: isAccent(item.accent) ? item.accent : 'purple',
    visual: isVisual(item.visual) ? item.visual : 'moon',
    capacity: item.capacity,
    bedrooms: item.bedrooms,
    beds: item.beds ?? undefined,
    bathrooms: item.bathrooms,
    sqft: item.sqft,
    amenities: item.amenities,
    location: item.location,
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