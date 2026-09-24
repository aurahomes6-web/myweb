import { asTrimmed } from './validation.js'

/**
 * Admin-only validation for THE SPACE configuration (Phase: The Space).
 *
 * The space config is a whole-property document:
 *   - a structured capacity range (min/max guests) stored on the Property row,
 *   - an ordered list of arbitrary label/value attribute cards.
 *
 * Attributes are free-form: the admin may write any label (e.g. “Kitchen”,
 * “Floor”, “Parking”) with any value text. Only the capacity range and the icon
 * identifier are constrained. Capacity uses structured integers — never a
 * pre-formatted string.
 */

export const SPACE_ICONS = [
  'users',
  'bed',
  'bath',
  'interior',
  'parking',
  'kitchen',
  'floor',
  'terrace',
  'view',
  'garden',
  'wifi',
  'tv',
  'ac',
  'laundry',
  'security',
  'lock',
  'coffee',
  'workspace',
  'dining',
  'living',
  'pool',
  'gym',
  'keyless',
  'quiet',
] as const

export type SpaceIcon = (typeof SPACE_ICONS)[number]

export const MIN_GUESTS_MIN = 1
export const MAX_GUESTS_CAP = 100
export const MAX_SPACE_ATTRIBUTES = 60
export const SPACE_LABEL_MAX_LENGTH = 60
export const SPACE_VALUE_MAX_LENGTH = 140

export interface SpaceAttributeInput {
  label: string
  value: string
  icon: string | null
}

export interface SpaceConfigInput {
  minGuests: number
  maxGuests: number
  attributes: SpaceAttributeInput[]
}

export interface ValidationIssue {
  field: string
  message: string
}

export type SpaceConfigResult =
  | { ok: true; value: SpaceConfigInput }
  | { ok: false; issues: ValidationIssue[] }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSpaceIcon(value: unknown): value is SpaceIcon {
  return typeof value === 'string' && (SPACE_ICONS as readonly string[]).includes(value)
}

export function parseSpaceConfig(body: unknown): SpaceConfigResult {
  const issues: ValidationIssue[] = []
  if (!isRecord(body)) {
    return { ok: false, issues: [{ field: 'body', message: 'A JSON request body is required.' }] }
  }

  const minGuests = parseGuestCount(body.minGuests)
  const maxGuests = parseGuestCount(body.maxGuests)

  if (minGuests === null) {
    issues.push({ field: 'minGuests', message: 'Minimum guests must be a positive integer.' })
  }
  if (maxGuests === null) {
    issues.push({ field: 'maxGuests', message: 'Maximum guests must be a positive integer.' })
  }
  if (minGuests !== null && maxGuests !== null && minGuests > maxGuests) {
    issues.push({ field: 'minGuests', message: 'Minimum guests cannot exceed maximum guests.' })
  }

  const attributesRaw = body.attributes
  if (attributesRaw === undefined || attributesRaw === null) {
    issues.push({ field: 'attributes', message: 'attributes is required.' })
  } else if (!Array.isArray(attributesRaw)) {
    issues.push({ field: 'attributes', message: 'attributes must be an array.' })
  } else if (attributesRaw.length > MAX_SPACE_ATTRIBUTES) {
    issues.push({
      field: 'attributes',
      message: `At most ${MAX_SPACE_ATTRIBUTES} space attributes are allowed.`,
    })
  } else {
    for (let index = 0; index < attributesRaw.length; index += 1) {
      const entry = attributesRaw[index]
      if (!isRecord(entry)) {
        issues.push({ field: `attributes[${index}]`, message: 'Each attribute must be an object.' })
        continue
      }

      const label = asTrimmed(entry.label, SPACE_LABEL_MAX_LENGTH)
      if (!label) {
        issues.push({
          field: `attributes[${index}].label`,
          message: 'Every attribute needs a non-empty label.',
        })
      }

      const value = asTrimmed(entry.value, SPACE_VALUE_MAX_LENGTH)
      if (!value) {
        issues.push({
          field: `attributes[${index}].value`,
          message: 'Every attribute needs a non-empty value.',
        })
      }

      const icon = entry.icon === undefined || entry.icon === null || entry.icon === ''
        ? null
        : entry.icon
      if (icon !== null && !isSpaceIcon(icon)) {
        issues.push({
          field: `attributes[${index}].icon`,
          message: 'Icon must be one of the supported space icons or empty.',
        })
      }
    }
  }

  if (issues.length > 0) return { ok: false, issues }

  const parsedAttributes: SpaceAttributeInput[] = (attributesRaw as unknown[]).map((entry) => {
    const record = entry as Record<string, unknown>
    const icon = record.icon === undefined || record.icon === null || record.icon === ''
      ? null
      : (record.icon as string)
    return {
      label: asTrimmed(record.label, SPACE_LABEL_MAX_LENGTH) as string,
      value: asTrimmed(record.value, SPACE_VALUE_MAX_LENGTH) as string,
      icon,
    }
  })

  return {
    ok: true,
    value: {
      minGuests: minGuests as number,
      maxGuests: maxGuests as number,
      attributes: parsedAttributes,
    },
  }
}

function parseGuestCount(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value >= MIN_GUESTS_MIN && value <= MAX_GUESTS_CAP ? value : null
  }
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const parsed = Number(value)
    if (!Number.isSafeInteger(parsed)) return null
    return parsed >= MIN_GUESTS_MIN && parsed <= MAX_GUESTS_CAP ? parsed : null
  }
  return null
}