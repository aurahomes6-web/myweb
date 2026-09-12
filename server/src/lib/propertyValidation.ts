import { asTrimmed, parsePositiveInt } from './validation.js'

/** Admin-only validation for the editable property fields (Phase Admin). */

export interface PropertyUpdateInput {
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

export interface ValidationIssue {
  field: string
  message: string
}

export type PropertyUpdateResult =
  | { ok: true; value: PropertyUpdateInput }
  | { ok: false; issues: ValidationIssue[] }

export const MAX_AMENITIES = 30
export const MAX_AMENITY_LENGTH = 80

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function optionalText(value: unknown, maxLength: number): string | null {
  if (value === undefined || value === null || value === '') return null
  return asTrimmed(value, maxLength) ?? null
}

export function parsePropertyUpdate(body: unknown): PropertyUpdateResult {
  const issues: ValidationIssue[] = []
  if (!isRecord(body)) {
    return { ok: false, issues: [{ field: 'body', message: 'A JSON request body is required.' }] }
  }

  const name = asTrimmed(body.name, 120)
  const shortLabel = asTrimmed(body.shortLabel, 40)
  const description = asTrimmed(body.description, 5000)
  const shortDescription = asTrimmed(body.shortDescription, 500)
  const accent = asTrimmed(body.accent, 7)
  const visual = asTrimmed(body.visual, 32)
  const location = optionalText(body.location, 200)

  const capacity = parsePositiveInt(body.capacity)
  const bedrooms = parsePositiveInt(body.bedrooms)
  const bathrooms = parsePositiveInt(body.bathrooms)
  const sqft = parsePositiveInt(body.sqft)
  const bedsRaw = body.beds === undefined || body.beds === null || body.beds === ''
    ? null
    : parsePositiveInt(body.beds)

  const fields: Array<{ field: string; label: string; value: string | null }> = [
    { field: 'name', label: 'Property name', value: name },
    { field: 'shortLabel', label: 'Subtitle', value: shortLabel },
    { field: 'description', label: 'Description', value: description },
    { field: 'shortDescription', label: 'Short description', value: shortDescription },
    { field: 'accent', label: 'Accent', value: accent },
    { field: 'visual', label: 'Visual style', value: visual },
  ]
  for (const entry of fields) {
    if (!entry.value) {
      issues.push({ field: entry.field, message: `${entry.label} is required.` })
    }
  }

  if (capacity === null) issues.push({ field: 'capacity', message: 'Capacity must be a positive integer.' })
  if (bedrooms === null) issues.push({ field: 'bedrooms', message: 'Bedrooms must be a positive integer.' })
  if (bathrooms === null) issues.push({ field: 'bathrooms', message: 'Bathrooms must be a positive integer.' })
  if (sqft === null) issues.push({ field: 'sqft', message: 'Square footage must be a positive integer.' })
  if (bedsRaw === null && body.beds !== undefined && body.beds !== null && body.beds !== '') {
    issues.push({ field: 'beds', message: 'Beds must be a positive integer.' })
  }

  const amenitiesRaw = body.amenities
  let amenities: string[] = []
  if (!Array.isArray(amenitiesRaw)) {
    issues.push({ field: 'amenities', message: 'amenities must be an array of facility names.' })
  } else if (amenitiesRaw.length > MAX_AMENITIES) {
    issues.push({ field: 'amenities', message: `At most ${MAX_AMENITIES} facilities are allowed.` })
  } else {
    for (const entry of amenitiesRaw) {
      const text = asTrimmed(entry, MAX_AMENITY_LENGTH)
      if (!text) {
        issues.push({ field: 'amenities', message: 'Every facility must be a non-empty name.' })
        break
      }
      if (!amenities.includes(text)) amenities.push(text)
    }
    if (issues.length === 0 && amenities.length === 0) {
      issues.push({ field: 'amenities', message: 'Add at least one facility.' })
    }
  }

  if (issues.length > 0) return { ok: false, issues }

  return {
    ok: true,
    value: {
      name: name as string,
      shortLabel: shortLabel as string,
      description: description as string,
      shortDescription: shortDescription as string,
      capacity: capacity as number,
      bedrooms: bedrooms as number,
      beds: bedsRaw,
      bathrooms: bathrooms as number,
      sqft: sqft as number,
      amenities,
      accent: accent as string,
      visual: visual as string,
      location,
    },
  }
}