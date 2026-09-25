import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import PropertyCard from '@/components/property/PropertyCard'
import type { Property, PropertySpaceAttribute } from '@/types'

function attribute(label: string, value: string, icon: string | null, sort: number): PropertySpaceAttribute {
  return { id: `${label.toLowerCase()}-${sort}`, label, value, icon, sort }
}

function makeProperty(overrides: Partial<Property> = {}): Property {
  return {
    id: 'p-1',
    name: 'Aura Cozy Penthouse 1',
    slug: 'aura-cozy-penthouse-1',
    shortLabel: 'Penthouse 01',
    description: 'A beautiful penthouse.',
    shortDescription: 'A beautiful penthouse.',
    image: null,
    gallery: [],
    accent: 'purple',
    visual: 'moon',
    capacity: 4,
    minGuests: 1,
    maxGuests: 4,
    bedrooms: 2,
    bathrooms: 2,
    sqft: 1200,
    amenities: ['Free Wi-Fi', 'Smart TV'],
    location: null,
    pricePerNightPaise: 300000,
    discountedPricePerNightPaise: null,
    images: [],
    spaceAttributes: [],
    ...overrides,
  }
}

function render(property: Property): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <PropertyCard property={property} index={0} />
    </MemoryRouter>
  )
}

describe('PropertyCard — dynamic guest capacity', () => {
  it('renders a min–max range when they differ', () => {
    const html = render(makeProperty({ minGuests: 1, maxGuests: 4 }))
    expect(html).toContain('1–4 guests')
  })

  it('renders a single count when min and max are equal', () => {
    const html = render(makeProperty({ minGuests: 4, maxGuests: 4 }))
    expect(html).toContain('4 guests')
  })

  it('reflects capacity changes for the same card', () => {
    const one = render(makeProperty({ minGuests: 1, maxGuests: 4 }))
    const six = render(makeProperty({ minGuests: 2, maxGuests: 6 }))
    expect(one).toContain('1–4 guests')
    expect(six).toContain('2–6 guests')
    expect(six).not.toContain('1–4 guests')
  })
})

describe('PropertyCard — dynamic THE SPACE attributes', () => {
  it('shows the database-backed bedroom/bathroom/area values with their labels', () => {
    const property = makeProperty({
      spaceAttributes: [
        attribute('Bedrooms', '2', 'bed', 0),
        attribute('Bathrooms', '2', 'bath', 1),
        attribute('Area', '850 sqft', 'interior', 2),
      ],
    })
    const html = render(property)

    expect(html).toContain('Bedrooms 2')
    expect(html).toContain('Bathrooms 2')
    expect(html).toContain('Area 850 sqft')
    // The old hardcoded rows are gone.
    expect(html).not.toContain('1 bedroom')
    expect(html).not.toContain('1 bath')
    expect(html).not.toContain('600 sqft')
  })

  it('renders different THE SPACE values for different properties', () => {
    const first = render(
      makeProperty({
        slug: 'aura-cozy-penthouse-1',
        minGuests: 1,
        maxGuests: 4,
        spaceAttributes: [
          attribute('Bedrooms', '2', 'bed', 0),
          attribute('Bathrooms', '1', 'bath', 1),
          attribute('Area', '600 sqft', 'interior', 2),
        ],
      })
    )
    const second = render(
      makeProperty({
        id: 'p-2',
        slug: 'aura-cozy-penthouse-2',
        minGuests: 2,
        maxGuests: 6,
        spaceAttributes: [
          attribute('Bedrooms', '3', 'bed', 0),
          attribute('Bathrooms', '2', 'bath', 1),
          attribute('Area', '900 sqft', 'interior', 2),
        ],
      })
    )

    expect(first).toContain('1–4 guests')
    expect(first).toContain('Bedrooms 2')
    expect(first).toContain('Area 600 sqft')
    expect(second).toContain('2–6 guests')
    expect(second).toContain('Bedrooms 3')
    expect(second).toContain('Area 900 sqft')
    expect(second).not.toContain('Bedrooms 2')
    expect(second).not.toContain('1 bedroom')
  })

  it('hides unconfigured attributes instead of showing fake hardcoded values', () => {
    const html = render(makeProperty({ spaceAttributes: [] }))
    expect(html).toContain('1–4 guests')
    expect(html).not.toContain('1 bedroom')
    expect(html).not.toContain('1 bath')
    expect(html).not.toContain('600 sqft')
    // No standalone flat "4 guests" cell — capacity shows the stored range.
    expect(html).not.toContain('>4 guests<')
  })

  it('skips attributes with empty labels or values', () => {
    const property = makeProperty({
      spaceAttributes: [
        attribute('Bedrooms', '2', 'bed', 0),
        attribute('', '2', 'bath', 1),
        attribute('Area', '  ', 'interior', 2),
      ],
    })
    const html = render(property)
    expect(html).toContain('Bedrooms 2')
    expect(html).not.toContain('Bathrooms 2')
    expect(html).not.toContain('600 sqft')
  })

  it('keeps the card to four stat cells (capacity + three attributes)', () => {
    const property = makeProperty({
      spaceAttributes: [
        attribute('Bedrooms', '2', 'bed', 0),
        attribute('Bathrooms', '2', 'bath', 1),
        attribute('Area', '850 sqft', 'interior', 2),
        attribute('Terrace', 'Yes', 'terrace', 3),
      ],
    })
    const html = render(property)
    expect(html).toContain('Bedrooms 2')
    expect(html).toContain('Bathrooms 2')
    expect(html).toContain('Area 850 sqft')
    // The fifth attribute stays off the compact card (detail page shows all).
    expect(html).not.toContain('Terrace Yes')
  })

  it('maps a stored icon identifier to the shared space icon (fallback otherwise)', () => {
    const withIcon = render(makeProperty({ spaceAttributes: [attribute('Bathrooms', '2', 'bath', 0)] }))
    expect(withIcon).toContain('lucide-bath')

    const noIcon = render(makeProperty({ spaceAttributes: [attribute('Pet friendly', 'Yes', null, 0)] }))
    expect(noIcon).toContain('lucide-sparkles')
    expect(noIcon).toContain('Pet friendly Yes')
  })
})

describe('PropertyCard — nightly pricing', () => {
  it('shows the original rate when no discount is configured', () => {
    const html = render(makeProperty())
    expect(html).toContain('₹3,000')
    expect(html).not.toContain('line-through')
    expect(html).not.toContain('% off')
    expect(html).not.toContain('Offer price')
  })

  it('shows Coming Soon and no navigation or availability CTAs for inactive homes', () => {
    const html = render(makeProperty({ isActive: false }))
    expect(html).toContain('Coming soon')
    expect(html).not.toContain('View Details')
    expect(html).not.toContain('Check Availability')
    expect(html).not.toContain('/properties/aura-cozy-penthouse-1')
  })

  it('keeps both CTAs for active homes', () => {
    const html = render(makeProperty({ isActive: true }))
    expect(html).toContain('View Details')
    expect(html).toContain('Check Availability')
  })

  it('shows the effective rate with the original rate crossed out', () => {
    const html = render(makeProperty({ discountedPricePerNightPaise: 240000 }))
    expect(html).toContain('₹2,400')
    expect(html).toContain('₹3,000')
    expect(html).toContain('20% off')
    expect(html).toContain('line-through')
  })
})