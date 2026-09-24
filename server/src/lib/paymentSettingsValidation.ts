import { asTrimmed } from './validation.js'

/**
 * Admin payload for the editable UPI details shown on the customer payment page
 * (UPI name / ID / phone). The QR asset is managed through a separate image
 * upload endpoint, not through this JSON body.
 */

export interface PaymentSettingsDetailsInput {
  upiName: string
  upiId: string
  upiPhone: string
}

export interface ValidationIssue {
  field: string
  message: string
}

export type PaymentSettingsDetailsResult =
  | { ok: true; value: PaymentSettingsDetailsInput }
  | { ok: false; issues: ValidationIssue[] }

const UPI_NAME_MAX_LENGTH = 80
const UPI_ID_MAX_LENGTH = 80
const UPI_PHONE_MAX_LENGTH = 32

/** Lenient UPI id shape: handle followed by @provider (e.g. 9900662111@jupiteraxis). */
const UPI_ID_RE = /^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$/

// Phone is a display string ("+91 9900662111"); spaces, dashes and + are fine.
const UPI_PHONE_RE = /^\+?[0-9][0-9\s()-]{7,31}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Validate the three admin-editable UPI payment details.
 *
 * All fields are required trimmed strings. The UPI ID must look like a real
 * `handle@provider` address and the phone a plausible display number, so a
 * broken UPI id can never be pushed to customers.
 */
export function parsePaymentSettingsUpdate(body: unknown): PaymentSettingsDetailsResult {
  const issues: ValidationIssue[] = []

  if (!isRecord(body)) {
    return { ok: false, issues: [{ field: 'body', message: 'A JSON request body is required.' }] }
  }

  const upiName = asTrimmed(body.upiName, UPI_NAME_MAX_LENGTH)
  if (!upiName) {
    issues.push({ field: 'upiName', message: 'UPI name is required.' })
  }

  const upiId = asTrimmed(body.upiId, UPI_ID_MAX_LENGTH)
  if (!upiId) {
    issues.push({ field: 'upiId', message: 'UPI ID is required.' })
  } else if (!UPI_ID_RE.test(upiId)) {
    issues.push({ field: 'upiId', message: 'Enter a valid UPI ID (handle@provider).' })
  }

  const upiPhone = asTrimmed(body.upiPhone, UPI_PHONE_MAX_LENGTH)
  if (!upiPhone) {
    issues.push({ field: 'upiPhone', message: 'UPI phone is required.' })
  } else if (!UPI_PHONE_RE.test(upiPhone)) {
    issues.push({ field: 'upiPhone', message: 'Enter a valid phone number.' })
  }

  if (issues.length > 0) return { ok: false, issues }

  return {
    ok: true,
    value: {
      upiName: upiName as string,
      upiId: upiId as string,
      upiPhone: upiPhone as string,
    },
  }
}