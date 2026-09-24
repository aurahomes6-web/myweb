import { asTrimmed, isEmail } from './validation.js'

export interface ContactSettingsInput {
  email: string
  phone: string
  description: string
}

export interface ValidationIssue {
  field: string
  message: string
}

export type ContactSettingsResult =
  | { ok: true; value: ContactSettingsInput }
  | { ok: false; issues: ValidationIssue[] }

const EMAIL_MAX_LENGTH = 254
const PHONE_MAX_LENGTH = 32
const DESCRIPTION_MAX_LENGTH = 240

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Validate the global admin-editable contact configuration.
 *
 * All three fields are required trimmed strings: the email must pass the same
 * `isEmail` check the rest of the app uses, the phone is a display string
 * (e.g. "+91 98765 43210"), and the description is the footer tagline.
 */
export function parseContactSettings(body: unknown): ContactSettingsResult {
  const issues: ValidationIssue[] = []

  if (!isRecord(body)) {
    return { ok: false, issues: [{ field: 'body', message: 'A JSON request body is required.' }] }
  }

  const email = asTrimmed(body.email, EMAIL_MAX_LENGTH)
  if (!email) {
    issues.push({ field: 'email', message: 'Email is required.' })
  } else if (!isEmail(email)) {
    issues.push({ field: 'email', message: 'Enter a valid email address.' })
  }

  const phone = asTrimmed(body.phone, PHONE_MAX_LENGTH)
  if (!phone) {
    issues.push({ field: 'phone', message: 'Phone is required.' })
  }

  const description = asTrimmed(body.description, DESCRIPTION_MAX_LENGTH)
  if (!description) {
    issues.push({ field: 'description', message: 'Description is required.' })
  }

  if (issues.length > 0) return { ok: false, issues }

  return {
    ok: true,
    value: {
      email: email as string,
      phone: phone as string,
      description: description as string,
    },
  }
}