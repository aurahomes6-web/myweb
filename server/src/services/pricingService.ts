import type { CouponDiscountType } from '../generated/prisma/enums.js'

/**
 * Phase 5 pricing: money math and coupon discount rules.
 *
 * All amounts are stored and computed as INTEGER paise (₹3,000.00 → 300000).
 * The server is always the source of truth for prices — clients only ever
 * display these values, never supply them.
 */

export const CURRENCY = 'INR' as const

export const MIN_PERCENTAGE_DISCOUNT = 1
export const MAX_PERCENTAGE_DISCOUNT = 100

export interface CouponForPricing {
  discountType: CouponDiscountType
  discountValue: number
  maxUses: number | null
  uses: number
  expiresAt: Date | null
  deactivatedAt: Date | null
}

export type CouponRejectReason =
  | 'NOT_FOUND'
  | 'DEACTIVATED'
  | 'EXPIRED'
  | 'USAGE_EXCEEDED'

export const COUPON_REJECT_MESSAGE: Record<CouponRejectReason, string> = {
  NOT_FOUND: 'That coupon code is not valid.',
  DEACTIVATED: 'That coupon is no longer active.',
  EXPIRED: 'That coupon has expired.',
  USAGE_EXCEEDED: 'That coupon has reached its usage limit.',
}

export interface PricingSnapshot {
  nights: number
  originalPricePaise: number
  discountPaise: number
  finalPricePaise: number
  currency: typeof CURRENCY
  couponCode?: string
}

/** Total stay cost before discounts, in paise. */
export function computeStayTotal(pricePerNightPaise: number, nights: number): number {
  return pricePerNightPaise * nights
}

export function resolveEffectiveNightlyPricePaise(
  originalPricePerNightPaise: number,
  discountedPricePerNightPaise: number | null
): number {
  return discountedPricePerNightPaise !== null &&
    discountedPricePerNightPaise > 0 &&
    discountedPricePerNightPaise < originalPricePerNightPaise
    ? discountedPricePerNightPaise
    : originalPricePerNightPaise
}

export interface StayPricing {
  originalPricePaise: number
  effectivePricePaise: number
  propertyDiscountPaise: number
  discountPaise: number
  finalPricePaise: number
}

export function computeStayPricing(
  originalPricePerNightPaise: number,
  discountedPricePerNightPaise: number | null,
  nights: number
): StayPricing {
  const originalPricePaise = computeStayTotal(originalPricePerNightPaise, nights)
  const effectivePricePaise = computeStayTotal(
    resolveEffectiveNightlyPricePaise(originalPricePerNightPaise, discountedPricePerNightPaise),
    nights
  )
  const propertyDiscountPaise = originalPricePaise - effectivePricePaise
  return {
    originalPricePaise,
    effectivePricePaise,
    propertyDiscountPaise,
    discountPaise: propertyDiscountPaise,
    finalPricePaise: effectivePricePaise,
  }
}

/** Discount in paise for a coupon against a given pre-discount total. */
export function computeDiscountPaise(
  coupon: CouponForPricing,
  originalTotalPaise: number
): number {
  if (coupon.discountType === 'PERCENTAGE') {
    const raw = Math.round((originalTotalPaise * coupon.discountValue) / 100)
    return Math.min(raw, originalTotalPaise)
  }
  return Math.min(coupon.discountValue, originalTotalPaise)
}

/**
 * Why a coupon must not be accepted right now, or null when it may be used.
 * Requires the target stay context via the pre-discount total: a coupon that
 * exceeds the stay total is clamped, not rejected.
 */
export function couponRejectReason(
  coupon: CouponForPricing | null,
  now: Date = new Date()
): CouponRejectReason | null {
  if (!coupon) return 'NOT_FOUND'
  if (coupon.deactivatedAt !== null) return 'DEACTIVATED'
  if (coupon.expiresAt !== null && coupon.expiresAt.getTime() <= now.getTime()) {
    return 'EXPIRED'
  }
  if (coupon.maxUses !== null && coupon.uses >= coupon.maxUses) return 'USAGE_EXCEEDED'
  return null
}

/** ₹3,000 formatted for display and WhatsApp bodies (Indian digit grouping). */
export function formatINR(paise: number): string {
  const rupees = paise / 100
  return `₹${rupees.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}