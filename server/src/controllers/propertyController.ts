import { Request, Response } from 'express'
import { PropertyImageKind } from '../generated/prisma/enums.js'
import { prisma } from '../lib/db.js'
import { propertyDisplayOrderBy } from '../lib/propertyOrder.js'

export interface PublicPropertyImage {
  id: string
  kind: PropertyImageKind
  sort: number
  url: string
  alt: string
}

interface PropertyImageRow {
  id: string
  kind: PropertyImageKind
  sort: number
  url: string
  alt: string
}

export interface PublicSpaceAttribute {
  id: string
  label: string
  value: string
  icon: string | null
  sort: number
}

export interface PublicProperty {
  id: string
  slug: string
  name: string
  shortLabel: string
  description: string
  shortDescription: string
  capacity: number
  minGuests: number
  maxGuests: number
  isActive: boolean
  amenities: string[]
  accent: string
  visual: string
  location: string | null
  /** Nightly rate in integer paise (₹3,000 → 300000). */
  pricePerNightPaise: number
  discountedPricePerNightPaise: number | null
  images: PublicPropertyImage[]
  spaceAttributes: PublicSpaceAttribute[]
}

function serializeImage(image: PropertyImageRow): PublicPropertyImage {
  return { id: image.id, kind: image.kind, sort: image.sort, url: image.url, alt: image.alt }
}

interface PropertyRow {
  id: string
  slug: string
  name: string
  shortLabel: string
  description: string
  shortDescription: string
  capacity: number
  minGuests: number
  isActive?: boolean
  bedrooms?: number | null
  beds?: number | null
  bathrooms?: number | null
  sqft?: number | null
  amenities: string[]
  accent: string
  visual: string
  location: string | null
  pricePerNightPaise: number
  discountedPricePerNightPaise: number | null
  images?: PropertyImageRow[]
  spaceAttributes?: PublicSpaceAttribute[]
}

export function serializeProperty(property: PropertyRow): PublicProperty {
  return {
    id: property.id,
    slug: property.slug,
    name: property.name,
    shortLabel: property.shortLabel,
    description: property.description,
    shortDescription: property.shortDescription,
    capacity: property.capacity,
    minGuests: property.minGuests,
    maxGuests: property.capacity,
    isActive: property.isActive !== false,
    amenities: property.amenities,
    accent: property.accent,
    visual: property.visual,
    location: property.location,
    pricePerNightPaise: property.pricePerNightPaise,
    discountedPricePerNightPaise: property.discountedPricePerNightPaise ?? null,
    images: (property.images ?? []).map(serializeImage),
    spaceAttributes: (property.spaceAttributes ?? []).map((attr) => ({
      id: attr.id,
      label: attr.label,
      value: attr.value,
      icon: attr.icon ?? null,
      sort: attr.sort,
    })),
  }
}

const propertyInclude = {
  images: {
    orderBy: { sort: 'asc' as const },
  },
  spaceAttributes: {
    orderBy: { sort: 'asc' as const },
  },
} as const

export async function listPropertiesHandler(_req: Request, res: Response) {
  const properties = await prisma.property.findMany({
    orderBy: propertyDisplayOrderBy,
    include: propertyInclude,
  })
  res.json({ properties: properties.map(serializeProperty) })
}

export async function getPropertyHandler(req: Request, res: Response) {
  const reference = typeof req.params.id === 'string' ? req.params.id : undefined
  if (!reference) {
    return res.status(400).json({ error: 'Property id or slug is required' })
  }

  const property = await prisma.property.findFirst({
    where: { OR: [{ id: reference }, { slug: reference }] },
    include: propertyInclude,
  })

  if (!property) {
    return res.status(404).json({ error: 'Property not found' })
  }

  res.json(serializeProperty(property))
}