const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function isNonEmptyString(value: unknown, maxLength = 500): value is string {
  const text = asString(value)
  return text !== null && text.length <= maxLength
}

export function isEmail(value: unknown): value is string {
  const text = asString(value)
  return text !== null && EMAIL_RE.test(text)
}

/** Accept a positive integer passed either as a number or a numeric string. */
export function parsePositiveInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value
  }
  if (typeof value === 'string' && /^[1-9]\d*$/.test(value)) {
    const parsed = Number(value)
    return Number.isSafeInteger(parsed) ? parsed : null
  }
  return null
}

export function asTrimmed(value: unknown, maxLength = 500): string | null {
  const text = asString(value)
  return text !== null && text.length <= maxLength ? text : null
}