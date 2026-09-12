import { Request, Response } from 'express'
import type { Property } from '../generated/prisma/client.js'
import { prisma } from '../lib/db.js'

function serializeProperty(property: Property) {
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
  }
}

export async function listPropertiesHandler(_req: Request, res: Response) {
  const properties = await prisma.property.findMany({
    orderBy: { name: 'asc' },
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
  })

  if (!property) {
    return res.status(404).json({ error: 'Property not found' })
  }

  res.json(serializeProperty(property))
}