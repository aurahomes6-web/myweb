import { CouponDiscountType } from '../generated/prisma/enums.js'
import { asTrimmed, parsePositiveInt } from './validation.js'
import { MAX_PERCENTAGE_DISCOUNT, MIN_PERCENTAGE_DISCOUNT } from '../services/pricingService.js'

/**
 * Admin-only parsing for coupon creation/edits (Phase 5).
 * The server is authoritative: anything suspicious is rejected here.
 */

export const MAX_COUPON_CODE_LENGTH = 40
export const COUPON_CODE_RE = /^[A-Z0-9][A-Z0-9_-]*$/

export interface CouponIssue {
  field: string
  message: string
}

export interface CouponInput {
  code: string
  discountType: CouponDiscountType
  discountValue: number
  maxUses: number | null
  expiresAt: string | null
}

export type CouponInputResult =
  | { ok: true; value: CouponInput }
  | { ok: false; issues: CouponIssue[] }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Normalize a user-supplied code: uppercase, no surrounding space. */
export function normalizeCouponCode(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const code = value.trim().toUpperCase()
  if (code.length === 0 || code.length > MAX_COUPON_CODE_LENGTH) return null
  if (!COUPON_CODE_RE.test(code)) return null
  return code
}

export function parseCouponInput(body: unknown): CouponInputResult {
  const issues: CouponIssue[] = []
  if (!isRecord(body)) {
    return { ok: false, issues: [{ field: 'body', message: 'A JSON request body is required.' }] }
  }

  const code = normalizeCouponCode(body.code)
  if (!code) {
    issues.push({
      field: 'code',
      message: `Coupon code must be 1–${MAX_COUPON_CODE_LENGTH} letters, numbers, dashes or underscores.`,
    })
  }

  const discountTypeRaw = asTrimmed(body.discountType)
  const discountType =
    discountTypeRaw === 'FIXED' || discountTypeRaw === 'PERCENTAGE'
      ? (discountTypeRaw as CouponDiscountType)
      : null
  if (!discountType) {
    issues.push({ field: 'discountType', message: 'Discount type must be FIXED or PERCENTAGE.' })
  }

  const discountValue = parsePositiveInt(body.discountValue)
  if (discountValue === null) {
    issues.push({ field: 'discountValue', message: 'Discount value must be a positive integer.' })
  } else if (discountType === 'PERCENTAGE' && (discountValue < MIN_PERCENTAGE_DISCOUNT || discountValue > MAX_PERCENTAGE_DISCOUNT)) {
    issues.push({
      field: 'discountValue',
      message: `Percentage discount must be between ${MIN_PERCENTAGE_DISCOUNT} and ${MAX_PERCENTAGE_DISCOUNT}.`,
    })
  }

  const maxUsesRaw =
    body.maxUses === undefined || body.maxUses === null || body.maxUses === ''
      ? null
      : parsePositiveInt(body.maxUses)
  if (body.maxUses !== undefined && body.maxUses !== null && body.maxUses !== '' && maxUsesRaw === null) {
    issues.push({ field: 'maxUses', message: 'Max uses must be a positive integer.' })
  }

  let expiresAt: string | null = null
  if (body.expiresAt !== undefined && body.expiresAt !== null && body.expiresAt !== '') {
    const raw = asTrimmed(body.expiresAt)
    if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(`${raw}T00:00:00.000Z`))) {
      issues.push({ field: 'expiresAt', message: 'Expiry must be a valid YYYY-MM-DD date.' })
    } else {
      expiresAt = raw
    }
  }

  if (issues.length > 0) return { ok: false, issues }

  return {
    ok: true,
    value: {
      code: code as string,
      discountType: discountType as CouponDiscountType,
      discountValue: discountValue as number,
      maxUses: maxUsesRaw,
      expiresAt,
    },
  }
}

/** A coupon expires at the end of the given local date (UTC end-of-day). */
export function toExpiryDate(dateKey: string): Date {
  return new Date(`${dateKey}T23:59:59.999Z`)
}