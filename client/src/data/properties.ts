import { imageAssets } from '@/config/images'
import type { Property } from '@/types'

export const properties: Property[] = [
  {
    id: '1',
    name: 'Aura Cozy Penthouse 1',
    slug: 'aura-cozy-penthouse-1',
    shortLabel: 'Penthouse 01',
    description:
      'A stunning penthouse retreat with panoramic views and premium finishes throughout. This thoughtfully designed space blends modern luxury with cozy comfort, featuring floor-to-ceiling windows, a private terrace, and curated interiors that feel like a sanctuary above the city.',
    shortDescription:
      'Panoramic views, a private terrace, and curated interiors above the city.',
    image: imageAssets.properties['aura-cozy-penthouse-1'].mainImage,
    gallery: imageAssets.properties['aura-cozy-penthouse-1'].gallery,
    accent: 'purple',
    visual: 'moon',
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
    location: null,
  },
  {
    id: '2',
    name: 'Aura Cozy Penthouse 2',
    slug: 'aura-cozy-penthouse-2',
    shortLabel: 'Penthouse 02',
    description:
      'An elegant urban escape designed for those who appreciate refined living. Penthouse 2 offers a sophisticated open-plan layout with designer furnishings, ambient lighting, and a seamless connection between indoor and outdoor spaces.',
    shortDescription:
      'Sophisticated open-plan living with designer furnishings and ambient light.',
    image: imageAssets.properties['aura-cozy-penthouse-2'].mainImage,
    gallery: imageAssets.properties['aura-cozy-penthouse-2'].gallery,
    accent: 'cyan',
    visual: 'dawn',
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
    location: null,
  },
  {
    id: '3',
    name: 'Aura Cozy Penthouse 3',
    slug: 'aura-cozy-penthouse-3',
    shortLabel: 'Penthouse 03',
    description:
      'A warm and inviting penthouse that combines contemporary style with homelike comfort. Penthouse 3 features rich textures, thoughtful details, and a peaceful atmosphere that makes every stay feel special.',
    shortDescription:
      'Contemporary warmth with rich textures and a homelike, peaceful atmosphere.',
    image: imageAssets.properties['aura-cozy-penthouse-3'].mainImage,
    gallery: imageAssets.properties['aura-cozy-penthouse-3'].gallery,
    accent: 'magenta',
    visual: 'evening',
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
    location: null,
  },
]

export function getPropertyBySlug(slug: string): Property | undefined {
  return properties.find((property) => property.slug === slug)
}