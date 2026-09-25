import { Router } from 'express'
import { prisma } from '../lib/db.js'
import { normalizeCouponCode } from '../lib/couponValidation.js'
import { toUtcDate } from '../lib/dateUtils.js'
import { checkCouponUsable } from '../services/couponService.js'
import { computeDiscountPaise, computeStayPricing, CURRENCY } from '../services/pricingService.js'

/**
 * Public coupon validation. This endpoint never increments usage and never
 * reveals internal data — it answers "can this referral code be applied, and
 * how much would it save for these dates?" The authoritative check + atomic
 * consumption still happens server-side at booking time.
 */

const router = Router()

const REJECTION_CODES: Record<string, { http: number; code: string }> = {
  NOT_FOUND: { http: 404, code: 'COUPON_NOT_FOUND' },
  DEACTIVATED: { http: 400, code: 'COUPON_DEACTIVATED' },
  EXPIRED: { http: 400, code: 'COUPON_EXPIRED' },
  USAGE_EXCEEDED: { http: 400, code: 'COUPON_USAGE_EXCEEDED' },
}

router.post('/validate', async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>
  const code = normalizeCouponCode(body.couponCode)
  if (!code) {
    return res.status(400).json({
      error: 'VALIDATION_ERROR',
      message: 'A valid coupon code is required.',
    })
  }

  const result = await checkCouponUsable(prisma, code)
  if (!result.ok) {
    const mapping = REJECTION_CODES[result.reason] ?? { http: 400, code: 'COUPON_INVALID' }
    return res.status(mapping.http).json({
      error: mapping.code,
      message: result.message,
      couponCode: result.couponCode,
    })
  }

  // Optional stay context: when dates + property are supplied, also return the
  // exact discount that would apply. Any parsing difficulty just omits the
  // figure — the result is never authoritative for the actual booking.
  const coupon = result.coupon
  const propertyId = typeof body.propertyId === 'string' ? body.propertyId.trim() : ''
  const checkIn = typeof body.checkIn === 'string' ? body.checkIn.trim() : ''
  const checkOut = typeof body.checkOut === 'string' ? body.checkOut.trim() : ''
  let discountPaise: number | undefined
  if (propertyId && checkIn && checkOut) {
    try {
      const property = await prisma.property.findFirst({
        where: { OR: [{ id: propertyId }, { slug: propertyId }] },
        select: { pricePerNightPaise: true, discountedPricePerNightPaise: true },
      })
      const nights = Math.round(
        (toUtcDate(checkOut).getTime() - toUtcDate(checkIn).getTime()) / (1000 * 60 * 60 * 24)
      )
      if (property && nights > 0) {
        discountPaise = computeDiscountPaise(
          {
            discountType: coupon.discountType,
            discountValue: coupon.discountValue,
            maxUses: coupon.maxUses,
            uses: coupon.uses,
            expiresAt: coupon.expiresAt ? new Date(coupon.expiresAt) : null,
            deactivatedAt: coupon.deactivatedAt ? new Date(coupon.deactivatedAt) : null,
          },
          computeStayPricing(
            property.pricePerNightPaise,
            property.discountedPricePerNightPaise,
            nights
          ).effectivePricePaise
        )
      }
    } catch {
      discountPaise = undefined
    }
  }

  res.json({
    ok: true,
    coupon: { code: coupon.code, discountType: coupon.discountType, discountValue: coupon.discountValue },
    ...(discountPaise !== undefined ? { discountPaise, currency: CURRENCY } : {}),
  })
})

export default router