import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client.js'
import { DEFAULT_CONTACT_SETTINGS } from '../src/services/contactService.js'
import { DEFAULT_PAYMENT_SETTINGS } from '../src/services/paymentSettingsService.js'
import { DEFAULT_HOMEPAGE_SETTINGS } from '../src/services/homepageSettingsService.js'

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
    isActive: true,
    sortOrder: 1,
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
    isActive: true,
    sortOrder: 2,
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
    isActive: true,
    sortOrder: 3,
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

  // Singleton rows must exist before the first admin/public “settings” read so
  // the UI always has a working value. `update: {}` keeps admin edits intact on
  // re-seeds (only the missing row is ever created).
  const paymentSettingsPromise = prisma.paymentSettings.upsert({
    where: { id: 'single' },
    update: {},
    create: {
      id: 'single',
      upiName: DEFAULT_PAYMENT_SETTINGS.upiName,
      upiId: DEFAULT_PAYMENT_SETTINGS.upiId,
      upiPhone: DEFAULT_PAYMENT_SETTINGS.upiPhone,
      // Intentionally empty — the public API falls back to `/qr.jpeg` until an
      // admin uploads a durable QR. Keeps the migration QR working.
      qrCodeUrl: '',
    },
  })
  const homepageSettingsPromise = prisma.homepageSettings.upsert({
    where: { id: 'single' },
    update: {},
    create: {
      id: 'single',
      ...DEFAULT_HOMEPAGE_SETTINGS,
    },
  })

  await prisma.$transaction([
    prisma.contactSettings.upsert({
      where: { id: 'single' },
      update: {},
      create: {
        id: 'single',
        email: DEFAULT_CONTACT_SETTINGS.email,
        phone: DEFAULT_CONTACT_SETTINGS.phone,
        description: DEFAULT_CONTACT_SETTINGS.description,
      },
    }),
    paymentSettingsPromise,
    homepageSettingsPromise,
  ])
  console.log(`Seeded ${count} properties + singleton settings rows.`)
}

main()
  .catch((error) => {
    console.error('Seed failed:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })