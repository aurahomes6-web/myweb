import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import PropertyGrid from '@/components/property/PropertyGrid'
import type { Property } from '@/types'

function makeProperty(index: number, isActive = true): Property {
  return {
    id: `p-${index}`,
    name: `Aura Cozy Penthouse ${index}`,
    slug: `aura-cozy-penthouse-${index}` as Property['slug'],
    shortLabel: `Penthouse 0${index}`,
    description: `Description ${index}`,
    shortDescription: `Short description ${index}`,
    image: null,
    gallery: [],
    accent: 'purple',
    visual: 'moon',
    capacity: 4,
    minGuests: 1,
    maxGuests: 4,
    isActive,
    amenities: ['Wi-Fi'],
    location: null,
    pricePerNightPaise: 300000,
    discountedPricePerNightPaise: null,
    images: [],
    spaceAttributes: [],
  }
}

function render(items: Property[]): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <PropertyGrid items={items} />
    </MemoryRouter>
  )
}

describe('PropertyGrid responsive layout and order', () => {
  it('uses a single mobile column, tablet columns, and three desktop columns', () => {
    const html = render([makeProperty(1)])
    expect(html).toContain('grid-cols-1')
    expect(html).toContain('md:grid-cols-2')
    expect(html).toContain('lg:grid-cols-3')
    expect(html).toContain('min-w-0')
  })

  it('preserves the canonical property order without sorting by active state', () => {
    const html = render([makeProperty(1), makeProperty(2, false), makeProperty(3)])
    expect(html.indexOf('Aura Cozy Penthouse 1')).toBeLessThan(html.indexOf('Aura Cozy Penthouse 2'))
    expect(html.indexOf('Aura Cozy Penthouse 2')).toBeLessThan(html.indexOf('Aura Cozy Penthouse 3'))
  })

  it('wraps long card content instead of forcing a fixed width', () => {
    const html = render([makeProperty(1)])
    expect(html).toContain('break-words')
    expect(html).toContain('max-w-full')
  })
})
