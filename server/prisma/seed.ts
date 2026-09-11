import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client.js'

const databaseUrl =
  process.env.DATABASE_URL ?? process.env.DIRECT_URL

if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL is not set. Add your Supabase pooler URL to server/.env (never commit it).'
  )
}

const prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl) })

const properties = [
  {
    slug: 'aura-cozy-penthouse-1',
    name: 'Aura Cozy Penthouse 1',
    shortLabel: 'Penthouse 01',
    description:
      'A stunning penthouse retreat with panoramic views and premium finishes throughout. This thoughtfully designed space blends modern luxury with cozy comfort, featuring floor-to-ceiling windows, a private terrace, and curated interiors that feel like a sanctuary above the city.',
    shortDescription:
      'Panoramic views, a private terrace, and curated interiors above the city.',
    capacity: 4,
    bedrooms: 2,
    bathrooms: 2,
    sqft: 1200,
    amenities: [
      'Free Wi-Fi',
      'Smart TV',
      'Full Kitchen',
      'Private Terrace',
      'Air Conditioning',
      'Washer & Dryer',
      'Parking',
      'City Views',
    ],
    accent: 'purple',
    visual: 'moon',
    location: null,
  },
  {
    slug: 'aura-cozy-penthouse-2',
    name: 'Aura Cozy Penthouse 2',
    shortLabel: 'Penthouse 02',
    description:
      'An elegant urban escape designed for those who appreciate refined living. Penthouse 2 offers a sophisticated open-plan layout with designer furnishings, ambient lighting, and a seamless connection between indoor and outdoor spaces.',
    shortDescription:
      'Sophisticated open-plan living with designer furnishings and ambient light.',
    capacity: 4,
    bedrooms: 2,
    bathrooms: 2,
    sqft: 1150,
    amenities: [
      'Free Wi-Fi',
      'Smart TV',
      'Full Kitchen',
      'Balcony',
      'Air Conditioning',
      'Washer & Dryer',
      'Parking',
      'Garden Views',
    ],
    accent: 'cyan',
    visual: 'dawn',
    location: null,
  },
  {
    slug: 'aura-cozy-penthouse-3',
    name: 'Aura Cozy Penthouse 3',
    shortLabel: 'Penthouse 03',
    description:
      'A warm and inviting penthouse that combines contemporary style with homelike comfort. Penthouse 3 features rich textures, thoughtful details, and a peaceful atmosphere that makes every stay feel special.',
    shortDescription:
      'Contemporary warmth with rich textures and a homelike, peaceful atmosphere.',
    capacity: 6,
    bedrooms: 3,
    bathrooms: 2,
    sqft: 1500,
    amenities: [
      'Free Wi-Fi',
      'Smart TV',
      'Full Kitchen',
      'Private Terrace',
      'Air Conditioning',
      'Washer & Dryer',
      'Parking',
      'Dual Views',
    ],
    accent: 'magenta',
    visual: 'evening',
    location: null,
  },
]

async function main() {
  for (const property of properties) {
    await prisma.property.upsert({
      where: { slug: property.slug },
      update: property,
      create: property,
    })
  }
  const count = await prisma.property.count()
  console.log(`Seeded ${count} properties.`)
}

main()
  .catch((error) => {
    console.error('Seed failed:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })