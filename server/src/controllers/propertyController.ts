import { Request, Response } from 'express'
import { PropertyImageKind } from '../generated/prisma/enums.js'
import type { Property } from '../generated/prisma/client.js'
import { prisma } from '../lib/db.js'

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

export interface PublicProperty {
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
  /** Nightly rate in integer paise (₹3,000 → 300000). */
  pricePerNightPaise: number
  images: PublicPropertyImage[]
}

function serializeImage(image: PropertyImageRow): PublicPropertyImage {
  return { id: image.id, kind: image.kind, sort: image.sort, url: image.url, alt: image.alt }
}

function serializeProperty(property: Property & { images?: PropertyImageRow[] }): PublicProperty {
  return {
    id: property.id,
    slug: property.slug,
    name: property.name,
    shortLabel: property.shortLabel,
    description: property.description,
    shortDescription: property.shortDescription,
    capacity: property.capacity,
    bedrooms: property.bedrooms,
    beds: property.beds,
    bathrooms: property.bathrooms,
    sqft: property.sqft,
    amenities: property.amenities,
    accent: property.accent,
    visual: property.visual,
    location: property.location,
    pricePerNightPaise: property.pricePerNightPaise,
    images: (property.images ?? []).map(serializeImage),
  }
}

const propertyInclude = {
  images: {
    orderBy: { sort: 'asc' as const },
  },
} as const

export async function listPropertiesHandler(_req: Request, res: Response) {
  const properties = await prisma.property.findMany({
    orderBy: { name: 'asc' },
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