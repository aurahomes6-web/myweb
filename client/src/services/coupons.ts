import { API_BASE_URL } from '@/config/api'
import type { ValidatedCoupon } from '@/types'

/**
 * Public coupon validation service (Phase 5).
 *
 * Calls the EXISTING public endpoint:
 *   POST /api/coupons/validate
 * Request:  { couponCode, propertyId, checkIn, checkOut }
 * Success:  { ok: true, coupon: { code, discountType, discountValue }, discountPaise?, currency }
 * Failure:  4xx { error, message, couponCode? }
 *
 * The server is always authoritative — the discount figure returned here is
 * for display only and is recomputed atomically at booking time.
 */

export interface CouponValidationErrorShape {
  code: string
  message: string
}

export class CouponValidationError extends Error {
  override readonly name = 'CouponValidationError' as const
  readonly code: string

  constructor(shape: CouponValidationErrorShape) {
    super(shape.message)
    this.code = shape.code
  }
}

export async function validateCoupon(input: {
  couponCode: string
  propertyId: string
  checkIn: string
  checkOut: string
}): Promise<ValidatedCoupon> {
  const response = await fetch(`${API_BASE_URL}/api/coupons/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  const json: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const body = (json ?? null) as { error?: string; message?: string } | null
    throw new CouponValidationError({
      code: body?.error ?? 'COUPON_INVALID',
      message: body?.message ?? 'This coupon could not be applied.',
    })
  }

  const body = json as {
    ok: true
    coupon?: { code: string; discountType: 'FIXED' | 'PERCENTAGE'; discountValue: number }
    discountPaise?: number
  }
  if (!body.coupon || typeof body.discountPaise !== 'number') {
    throw new CouponValidationError({
      code: 'COUPON_INVALID',
      message: 'This coupon could not be applied to the selected stay.',
    })
  }

  return {
    code: body.coupon.code,
    discountType: body.coupon.discountType,
    discountValue: body.coupon.discountValue,
    discountPaise: body.discountPaise,
  }
}