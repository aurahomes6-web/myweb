import { asTrimmed } from './validation.js'

export interface HomepageSettingsUpdateInput {
  visualImageAlt: string
}

export interface ValidationIssue {
  field: string
  message: string
}

export type HomepageSettingsUpdateResult =
  | { ok: true; value: HomepageSettingsUpdateInput }
  | { ok: false; issues: ValidationIssue[] }

export const HOMEPAGE_VISUAL_ALT_MAX_LENGTH = 160

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseHomepageSettingsUpdate(body: unknown): HomepageSettingsUpdateResult {
  if (!isRecord(body)) {
    return { ok: false, issues: [{ field: 'body', message: 'A JSON request body is required.' }] }
  }

  const rawAlt = body.visualImageAlt
  const alt = asTrimmed(rawAlt, HOMEPAGE_VISUAL_ALT_MAX_LENGTH)
  if (typeof rawAlt !== 'string' || alt === null) {
    const message =
      typeof rawAlt === 'string' && rawAlt.trim().length > HOMEPAGE_VISUAL_ALT_MAX_LENGTH
        ? `Alt text must be ${HOMEPAGE_VISUAL_ALT_MAX_LENGTH} characters or fewer.`
        : 'Alt text is required.'
    return { ok: false, issues: [{ field: 'visualImageAlt', message }] }
  }

  return { ok: true, value: { visualImageAlt: alt } }
}
