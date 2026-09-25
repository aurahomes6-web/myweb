/**
 * Money helpers for the AURA HOMES public site.
 *
 * Every amount is stored and transported as **paise** (₹1 = 100 paise) with
 * four-digit grouped amounts (₹1,23,45,678), mirroring the server's
 * `pricingService.ts` currency decisions. These helpers MUST be kept in lock
 * step with `server/src/services/pricingService.ts`.
 */

export const CURRENCY = 'INR'

/** ₹3,000 → 300000. */
export function inrToPaise(inr: number): number {
  return Math.round((inr + Number.EPSILON) * 100)
}

/** 300000 → ₹3,000. */
export function formatINR(paise: number): string {
  return `${currencySymbol()}${indianGroup(paise / 100)}`
}

export interface NightlyPricing {
  effectivePricePaise: number
  hasDiscount: boolean
  discountPercent: number | null
}

export function resolveNightlyPricing(
  originalPricePaise: number,
  discountedPricePaise: number | null
): NightlyPricing {
  const hasDiscount =
    discountedPricePaise !== null &&
    Number.isInteger(discountedPricePaise) &&
    discountedPricePaise > 0 &&
    discountedPricePaise < originalPricePaise
  const effectivePricePaise = hasDiscount ? discountedPricePaise : originalPricePaise
  return {
    effectivePricePaise,
    hasDiscount,
    discountPercent: hasDiscount
      ? Math.round(((originalPricePaise - effectivePricePaise) * 100) / originalPricePaise)
      : null,
  }
}

/** 300000 → 3,000 */
export function formatINRWithoutSymbol(paise: number): string {
  return indianGroup(paise / 100)
}

function indianGroup(value: number): string {
  const fixed = Math.round((value + Number.EPSILON) * 100) / 100
  const [whole, fraction] = String(fixed).split('.')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',').replace(/^(\d+)(,\d{2})/, (_match, before, tail) => {
    const digits = before.replace(/\B(?=(\d{2})+(?!\d))/g, ',')
    return `${digits}${tail}`
  })
  return fraction ? `${grouped}.${fraction}` : grouped
}

function currencySymbol(): string {
  return '₹'
}

/**
 * Parses a user-typed "₹" amount (e.g. "3000", "3,000", "₹3000") into paise.
 * Returns `null` when the input is empty or not a valid non-negative number.
 */
export function parseINRToPaise(input: string): number | null {
  const cleaned = input.replace(/[₹,\s]/g, '')
  if (!cleaned) return null
  const value = Number(cleaned)
  if (!Number.isFinite(value) || value < 0) return null
  return inrToPaise(value)
}
