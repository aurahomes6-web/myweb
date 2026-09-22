import type { PrismaClient } from '../generated/prisma/client.js'
import type { Prisma } from '../generated/prisma/client.js'
import type { CouponDiscountType } from '../generated/prisma/enums.js'
import type { CouponInput } from '../lib/couponValidation.js'
import { toExpiryDate } from '../lib/couponValidation.js'
import {
  computeDiscountPaise,
  couponRejectReason,
  COUPON_REJECT_MESSAGE,
  type CouponForPricing,
  type CouponRejectReason,
} from './pricingService.js'
import { ConflictError, NotFoundError } from './adminService.js'

/**
 * Coupon administration + public validation + atomic consumption.
 *
 * Admin functions assume an authenticated caller and take a Prisma client so
 * unit tests can pass a fake. The public surface relies on the server being
 * the only source of truth for discount math, and `consumeCouponInTransaction`
 * bumps the usage counter atomically inside the booking transaction — a failed
 * booking rolls back its coupon usage too.
 */

export interface AdminCouponDto {
  id: string
  code: string
  discountType: CouponDiscountType
  discountValue: number
  maxUses: number | null
  expiresAt: string | null
  deactivatedAt: string | null
  createdAt: string
  updatedAt: string
  uses: number
  usageCount: number
}

export function serializeCouponDto(row: {
  id: string
  code: string
  discountType: CouponDiscountType
  discountValue: number
  maxUses: number | null
  expiresAt: Date | null
  deactivatedAt: Date | null
  createdAt: Date
  updatedAt: Date
  uses: number
  _count?: { usages: number }
}): AdminCouponDto {
  return {
    id: row.id,
    code: row.code,
    discountType: row.discountType,
    discountValue: row.discountValue,
    maxUses: row.maxUses,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    deactivatedAt: row.deactivatedAt ? row.deactivatedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    uses: row.uses,
    usageCount: row._count?.usages ?? row.uses,
  }
}

/** Coupon rejected during use — carries a stable reason code for the API. */
export class CouponInvalidError extends Error {
  override readonly name = 'CouponInvalidError' as const
  readonly reason: CouponRejectReason
  readonly couponCode: string

  constructor(reason: CouponRejectReason, couponCode: string) {
    super(COUPON_REJECT_MESSAGE[reason])
    this.reason = reason
    this.couponCode = couponCode
  }
}

const couponListInclude = { _count: { select: { usages: true } } } as const

export async function listCoupons(client: PrismaClient): Promise<AdminCouponDto[]> {
  const coupons = await client.coupon.findMany({
    orderBy: { createdAt: 'desc' },
    include: couponListInclude,
  })
  return coupons.map((c) => serializeCouponDto(c as never))
}

export async function createCoupon(client: PrismaClient, input: CouponInput): Promise<AdminCouponDto> {
  const existing = await client.coupon.findUnique({ where: { code: input.code }, select: { id: true } })
  if (existing) throw new ConflictError(`Coupon code "${input.code}" already exists.`)

  const coupon = await client.coupon.create({
    data: {
      code: input.code,
      discountType: input.discountType,
      discountValue: input.discountValue,
      maxUses: input.maxUses,
      expiresAt: input.expiresAt ? toExpiryDate(input.expiresAt) : null,
      uses: 0,
    },
    include: couponListInclude,
  })
  return serializeCouponDto(coupon as never)
}

export async function setCouponActive(
  client: PrismaClient,
  id: string,
  active: boolean,
  now: Date = new Date()
): Promise<AdminCouponDto> {
  const existing = await client.coupon.findUnique({ where: { id }, select: { id: true } })
  if (!existing) throw new NotFoundError('Coupon not found.')

  const coupon = await client.coupon.update({
    where: { id },
    data: { deactivatedAt: active ? null : now },
    include: couponListInclude,
  })
  return serializeCouponDto(coupon as never)
}

export async function deleteCoupon(client: PrismaClient, id: string): Promise<{ deleted: true }> {
  const existing = await client.coupon.findUnique({
    where: { id },
    select: { id: true, _count: { select: { usages: true } } },
  })
  if (!existing) throw new NotFoundError('Coupon not found.')
  if (existing._count.usages > 0) {
    throw new ConflictError(
      `Coupon "${id}" has already been used on ${existing._count.usages} booking(s) and cannot be deleted. Deactivate it instead.`
    )
  }
  await client.coupon.delete({ where: { id } })
  return { deleted: true }
}

/**
 * Check a coupon against its own state only (no booking context). Used by the
 * public validate endpoint before computing the stay price. Never increments
 * anything — usage is only recorded at booking time.
 */
export async function checkCouponUsable(
  client: PrismaClient,
  code: string,
  now: Date = new Date()
): Promise<
  | { ok: true; coupon: AdminCouponDto }
  | { ok: false; reason: CouponRejectReason; message: string; couponCode: string }
> {
  const coupon = await client.coupon.findUnique({ where: { code } })
  const reason = couponRejectReason(coupon as CouponForPricing | null, now)
  if (reason !== null) {
    const message = reason === 'NOT_FOUND' ? COUPON_REJECT_MESSAGE.NOT_FOUND : COUPON_REJECT_MESSAGE[reason]
    return { ok: false, reason, message, couponCode: code }
  }
  return { ok: true, coupon: serializeCouponDto(coupon as never) }
}

export interface ConsumedCoupon {
  id: string
  code: string
  discountPaise: number
}

/**
 * Validate + atomically consume a coupon inside a booking transaction.
 *
 * Safe against concurrent requests: the usage counter is incremented with a
 * conditional update (`uses < maxUses`), so a cap can never be overshot. Every
 * write lives in the caller's transaction — an aborted booking rolls the
 * increment back, so a coupon is only ever consumed by a successful booking.
 *
 * @throws CouponInvalidError when the coupon must not be applied.
 */
export async function consumeCouponInTransaction(
  tx: Prisma.TransactionClient,
  code: string,
  originalTotalPaise: number,
  now: Date = new Date()
): Promise<ConsumedCoupon> {
  const coupon = await tx.coupon.findUnique({ where: { code } })
  const reason = couponRejectReason(coupon as CouponForPricing | null, now)
  if (reason !== null) throw new CouponInvalidError(reason, code)

  const where: Prisma.CouponWhereInput = { id: coupon!.id }
  if (coupon!.maxUses !== null) where.uses = { lt: coupon!.maxUses }

  const updated = await tx.coupon.updateMany({
    where,
    data: { uses: { increment: 1 } },
  })
  if (updated.count !== 1) throw new CouponInvalidError('USAGE_EXCEEDED', coupon!.code)

  const discountPaise = computeDiscountPaise(coupon as CouponForPricing, originalTotalPaise)
  return { id: coupon!.id, code: coupon!.code, discountPaise }
}