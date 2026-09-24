import type { NextFunction, Request, Response } from 'express'
import multer from 'multer'
import type { PrismaClient } from '../generated/prisma/client.js'
import type { AdminConfig } from '../lib/adminAuth.js'
import { ADMIN_COOKIE_NAME, checkAdminCredentials, clearSessionCookie, issueSession, sessionCookie } from '../lib/adminAuth.js'
import { prisma } from '../lib/db.js'
import { validateCreateBooking } from '../lib/bookingValidation.js'
import { validateAdminAirbnb } from '../lib/airbnbValidation.js'
import { parsePropertyUpdate } from '../lib/propertyValidation.js'
import { parseSpaceConfig } from '../lib/spaceValidation.js'
import { parseCouponInput } from '../lib/couponValidation.js'
import { parseContactSettings } from '../lib/contactValidation.js'
import { BookingStatus } from '../generated/prisma/enums.js'
import { parseRejectionMessage } from '../lib/paymentValidation.js'
import { uploadSingleImage, ImageTypeError } from '../lib/uploadImage.js'
import { getObjectStorage } from '../storage/storage.js'
import { uploadPropertyImage, deletePropertyImage, parseImageSlot } from '../services/imageService.js'
import {
  checkCouponUsable,
  CouponInvalidError,
  createCoupon,
  deleteCoupon,
  listCoupons,
  setCouponActive,
} from '../services/couponService.js'
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  cancelAirbnb,
  cancelBooking,
  clearAirbnb,
  clearAirbnbBlockedDates,
  clearAllBookingData,
  clearBookings,
  createAirbnb,
  deleteAirbnb,
  deleteProperty,
  getAirbnb,
  getBooking,
  getPropertySpace,
  listAirbnb,
  listBookings,
  listProperties,
  updateAirbnb,
  updateBooking,
  updateProperty,
  updatePropertySpace,
} from '../services/adminService.js'
import { getContactSettings, updateContactSettings } from '../services/contactService.js'
import { acceptPayment, listPayments, rejectPayment } from '../services/paymentService.js'
import { parseReportRange } from '../lib/bookingReportValidation.js'
import {
  bookingsReportFileName,
  buildBookingsReportWorkbook,
  countBookingsInRange,
  listBookingsForReport,
} from '../services/bookingReportService.js'

/**
 * All routes reaching this controller are behind the authenticated admin
 * middleware — full Aadhaar numbers returned by the admin service are only
 * ever sent to that authenticated client.
 */

function apiError(code: string, message: string) {
  return { error: code, message }
}

function wrap(
  handler: (req: Request, res: Response) => Promise<Response | void>
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await handler(req, res)
    } catch (err) {
      if (err instanceof NotFoundError) {
        return res.status(404).json(apiError('NOT_FOUND', err.message))
      }
      if (err instanceof ConflictError) {
        return res.status(409).json(apiError('CONFLICT', err.message))
      }
      if (err instanceof BadRequestError) {
        return res.status(400).json(apiError('VALIDATION_ERROR', err.message))
      }
      if (err instanceof CouponInvalidError) {
        const codeByReason: Record<string, string> = {
          NOT_FOUND: 'COUPON_NOT_FOUND',
          DEACTIVATED: 'COUPON_DEACTIVATED',
          EXPIRED: 'COUPON_EXPIRED',
          USAGE_EXCEEDED: 'COUPON_USAGE_EXCEEDED',
        }
        return res
          .status(400)
          .json(apiError(codeByReason[err.reason] ?? 'COUPON_INVALID', err.message))
      }
      return next(err)
    }
  }
}

function validationError(
  res: Response,
  issues: Array<{ field: string; message: string }>
) {
  res.status(400).json({
    error: 'VALIDATION_ERROR',
    message: 'Please review the highlighted fields.',
    details: issues,
  })
}

// ── auth ───────────────────────────────────────────────────────────────────

export function login(config: AdminConfig | null) {
  return async (req: Request, res: Response) => {
    if (!config) {
      return res.status(503).json(apiError('ADMIN_NOT_CONFIGURED', 'Admin authentication is not configured.'))
    }
    const body = (req.body ?? {}) as Record<string, unknown>
    const username = typeof body.username === 'string' ? body.username : ''
    const password = typeof body.password === 'string' ? body.password : ''
    if (!checkAdminCredentials(config, username, password)) {
      return res.status(401).json(apiError('INVALID_CREDENTIALS', 'Invalid username or password.'))
    }
    const token = issueSession(config)
    res.setHeader('Set-Cookie', sessionCookie(ADMIN_COOKIE_NAME, token, config))
    return res.json({ ok: true })
  }
}

export function logout(config: AdminConfig | null) {
  return async (_req: Request, res: Response) => {
    res.setHeader('Set-Cookie', clearSessionCookie(ADMIN_COOKIE_NAME, config as AdminConfig))
    return res.json({ ok: true })
  }
}

export const me = wrap(async (_req: Request, res: Response) => {
  res.json({ ok: true, authenticated: true })
})

// ── bookings ───────────────────────────────────────────────────────────────

export const listBookingsHandler = wrap(async (req: Request, res: Response) => {
  const rawStatus = typeof req.query.status === 'string' ? req.query.status : ''
  const allowed = rawStatus === 'PENDING' || rawStatus === 'CONFIRMED' || rawStatus === 'CANCELLED'
  const status = allowed ? (rawStatus as BookingStatus) : undefined
  const bookings = await listBookings(prisma, status)
  res.json({ bookings })
})

export const getBookingHandler = wrap(async (req: Request, res: Response) => {
  const id = typeof req.params.id === 'string' ? req.params.id : ''
  const booking = await getBooking(prisma, id)
  res.json({ booking })
})

export const updateBookingHandler = wrap(async (req: Request, res: Response) => {
  const id = typeof req.params.id === 'string' ? req.params.id : ''
  const result = validateCreateBooking(req.body)
  if (!result.ok) return void validationError(res, result.issues)
  const booking = await updateBooking(prisma, id, result.value)
  res.json({ booking })
})

export const cancelBookingHandler = wrap(async (req: Request, res: Response) => {
  const id = typeof req.params.id === 'string' ? req.params.id : ''
  const booking = await cancelBooking(prisma, id)
  res.json({ booking })
})

// ── airbnb ─────────────────────────────────────────────────────────────────

export const listAirbnbHandler = wrap(async (req: Request, res: Response) => {
  const includeCancelled = req.query.include === 'all'
  const reservations = await listAirbnb(prisma, includeCancelled)
  res.json({ airbnbReservations: reservations })
})

export const getAirbnbHandler = wrap(async (req: Request, res: Response) => {
  const id = typeof req.params.id === 'string' ? req.params.id : ''
  const reservation = await getAirbnb(prisma, id)
  res.json({ reservation })
})

export const createAirbnbHandler = wrap(async (req: Request, res: Response) => {
  const result = validateAdminAirbnb(req.body)
  if (!result.ok) return void validationError(res, result.issues)
  const reservation = await createAirbnb(prisma, result.value)
  res.status(201).json({ reservation })
})

export const updateAirbnbHandler = wrap(async (req: Request, res: Response) => {
  const id = typeof req.params.id === 'string' ? req.params.id : ''
  const result = validateAdminAirbnb(req.body)
  if (!result.ok) return void validationError(res, result.issues)
  const reservation = await updateAirbnb(prisma, id, result.value)
  res.json({ reservation })
})

export const cancelAirbnbHandler = wrap(async (req: Request, res: Response) => {
  const id = typeof req.params.id === 'string' ? req.params.id : ''
  const reservation = await cancelAirbnb(prisma, id)
  res.json({ reservation })
})

export const deleteAirbnbHandler = wrap(async (req: Request, res: Response) => {
  const id = typeof req.params.id === 'string' ? req.params.id : ''
  const result = await deleteAirbnb(prisma, id)
  res.json(result)
})

// ── properties ─────────────────────────────────────────────────────────────

export const listPropertiesHandler = wrap(async (_req: Request, res: Response) => {
  const properties = await listProperties(prisma)
  res.json({ properties })
})

export const updatePropertyHandler = wrap(async (req: Request, res: Response) => {
  const id = typeof req.params.id === 'string' ? req.params.id : ''
  const result = parsePropertyUpdate(req.body)
  if (!result.ok) return void validationError(res, result.issues)
  const property = await updateProperty(prisma, id, result.value)
  res.json({ property })
})

export const deletePropertyHandler = wrap(async (req: Request, res: Response) => {
  const id = typeof req.params.id === 'string' ? req.params.id : ''
  const result = await deleteProperty(prisma, id)
  res.json(result)
})

export const getPropertySpaceHandler = wrap(async (req: Request, res: Response) => {
  const id = typeof req.params.id === 'string' ? req.params.id : ''
  const space = await getPropertySpace(prisma, id)
  res.json({ space })
})

export const updatePropertySpaceHandler = wrap(async (req: Request, res: Response) => {
  const id = typeof req.params.id === 'string' ? req.params.id : ''
  const result = parseSpaceConfig(req.body)
  if (!result.ok) return void validationError(res, result.issues)
  const space = await updatePropertySpace(prisma, id, result.value)
  res.json({ space })
})

// ── global contact settings ────────────────────────────────────────────────

export const getContactSettingsHandler = wrap(async (_req: Request, res: Response) => {
  const contact = await getContactSettings(prisma)
  res.json({ contact })
})

export const updateContactSettingsHandler = wrap(async (req: Request, res: Response) => {
  const result = parseContactSettings(req.body)
  if (!result.ok) return void validationError(res, result.issues)
  const contact = await updateContactSettings(prisma, result.value)
  res.json({ contact })
})

// ── database cleanup ────────────────────────────────────────────────────────
//
// Destructive maintenance actions. The routers mount these behind BOTH
// requireCsrfHeader and the authenticated admin guard, and each handler still
// demands an explicit confirmation phrase so a stray request can never trigger
// a wipe. Properties and their configuration are never touched.

const CLEANUP_CONFIRM_DELETE = 'DELETE'
const CLEANUP_CONFIRM_DELETE_ALL = 'DELETE ALL'

function requireCleanupConfirmation(req: Request, res: Response, expected: string): boolean {
  const body = (req.body ?? {}) as Record<string, unknown>
  const confirm = typeof body.confirm === 'string' ? body.confirm.trim().toUpperCase() : ''
  if (confirm !== expected) {
    res.status(400).json(apiError('INVALID_CONFIRMATION', `Type “${expected}” to confirm this action.`))
    return false
  }
  return true
}

export const clearBookingsHandler = wrap(async (req: Request, res: Response) => {
  if (!requireCleanupConfirmation(req, res, CLEANUP_CONFIRM_DELETE)) return
  const result = await clearBookings(prisma)
  res.json({ ok: true, result })
})

export const clearAirbnbHandler = wrap(async (req: Request, res: Response) => {
  if (!requireCleanupConfirmation(req, res, CLEANUP_CONFIRM_DELETE)) return
  const result = await clearAirbnb(prisma)
  res.json({ ok: true, result })
})

export const clearAirbnbBlockedDatesHandler = wrap(async (req: Request, res: Response) => {
  if (!requireCleanupConfirmation(req, res, CLEANUP_CONFIRM_DELETE)) return
  const result = await clearAirbnbBlockedDates(prisma)
  res.json({ ok: true, result })
})

export const clearAllBookingDataHandler = wrap(async (req: Request, res: Response) => {
  if (!requireCleanupConfirmation(req, res, CLEANUP_CONFIRM_DELETE_ALL)) return
  const result = await clearAllBookingData(prisma)
  res.json({ ok: true, result })
})

// ── coupons ────────────────────────────────────────────────────────────────

export const listCouponsHandler = wrap(async (_req: Request, res: Response) => {
  const coupons = await listCoupons(prisma)
  res.json({ coupons })
})

export const createCouponHandler = wrap(async (req: Request, res: Response) => {
  const result = parseCouponInput(req.body)
  if (!result.ok) return void validationError(res, result.issues)
  const coupon = await createCoupon(prisma, result.value)
  res.status(201).json({ coupon })
})

export const setCouponActiveHandler = wrap(async (req: Request, res: Response) => {
  const id = typeof req.params.id === 'string' ? req.params.id : ''
  const body = (req.body ?? {}) as Record<string, unknown>
  if (typeof body.active !== 'boolean') {
    return void validationError(res, [{ field: 'active', message: 'active must be true or false.' }])
  }
  const coupon = await setCouponActive(prisma, id, body.active)
  res.json({ coupon })
})

export const deleteCouponHandler = wrap(async (req: Request, res: Response) => {
  const id = typeof req.params.id === 'string' ? req.params.id : ''
  const result = await deleteCoupon(prisma, id)
  res.json(result)
})

// ── UPI payments ────────────────────────────────────────────────────────────

export const listPaymentsHandler = wrap(async (_req: Request, res: Response) => {
  const payments = await listPayments(prisma)
  res.json({ payments })
})

export const acceptPaymentHandler = wrap(async (req: Request, res: Response) => {
  const id = typeof req.params.id === 'string' ? req.params.id : ''
  const payment = await acceptPayment(prisma, id)
  res.json({ payment })
})

export const rejectPaymentHandler = wrap(async (req: Request, res: Response) => {
  const id = typeof req.params.id === 'string' ? req.params.id : ''
  const body = (req.body ?? {}) as Record<string, unknown>
  const rawMessage = body.rejectionMessage
  const hasMessage = rawMessage !== undefined && rawMessage !== null && rawMessage !== ''
  const message = hasMessage ? parseRejectionMessage(rawMessage) : null
  if (hasMessage && message === null) {
    return void validationError(res, [
      { field: 'rejectionMessage', message: 'Rejection message must be 500 characters or fewer.' },
    ])
  }
  const payment = await rejectPayment(prisma, id, message)
  res.json({ payment })
})

// ── booking report (XLSX download) ───────────────────────────────────────────

const REPORT_XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/**
 * Streams an .xlsx of NORMAL bookings (and their guests) created in the range
 * `from`/`to`. Requires a valid admin session AND the CSRF header at the route
 * layer. An empty period returns a JSON marker instead of an empty file, so the
 * client can surface "No bookings found" rather than downloading garbage.
 *
 * The optional `client` argument lets tests inject a fake Prisma client; the
 * production route uses the shared singleton.
 */
export function makeBookingsReportHandler(client?: PrismaClient) {
  return wrap(async (req: Request, res: Response) => {
    const parsed = parseReportRange(req.query.from, req.query.to)
    if (!parsed.ok) return void validationError(res, parsed.issues)

    const db = client ?? prisma
    const count = await countBookingsInRange(db, parsed.value)
    if (count === 0) {
      return res.json({ empty: true, message: 'No bookings found for the selected period.' })
    }

    const bookings = await listBookingsForReport(db, parsed.value)
    const buffer = await buildBookingsReportWorkbook(bookings)
    res.setHeader('Content-Type', REPORT_XLSX_CONTENT_TYPE)
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${bookingsReportFileName(parsed.value.from, parsed.value.to)}"`
    )
    res.setHeader('Content-Length', String(buffer.length))
    res.end(buffer)
  })
}

export const bookingsReportHandler = makeBookingsReportHandler()

// ── property photos ───────────────────────────────────────────────────────

export function uploadImageMiddleware(req: Request, res: Response, next: NextFunction) {
  uploadSingleImage(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      const message =
        err.code === 'LIMIT_FILE_SIZE'
          ? 'Image must be 10 MB or smaller.'
          : 'Only one image per request is allowed.'
      return res.status(400).json(apiError('INVALID_IMAGE', message))
    }
    if (err instanceof ImageTypeError) {
      return res.status(400).json(apiError('INVALID_IMAGE', err.message))
    }
    next(err)
  })
}

export const uploadPropertyImageHandler = wrap(async (req: Request, res: Response) => {
  const propertyId = typeof req.params.id === 'string' ? req.params.id : ''
  const body = (req.body ?? {}) as Record<string, unknown>
  const slot = parseImageSlot(body.slot)
  if (!slot) {
    return void validationError(res, [
      { field: 'slot', message: 'slot must be main, sub1, sub2, sub3 or extra.' },
    ])
  }
  const alt = typeof body.alt === 'string' ? body.alt.trim().slice(0, 200) : ''
  if (!req.file) {
    return void validationError(res, [{ field: 'image', message: 'Choose an image to upload.' }])
  }
  const image = await uploadPropertyImage(
    prisma,
    getObjectStorage(),
    propertyId,
    slot,
    req.file.buffer,
    req.file.mimetype,
    alt
  )
  res.status(201).json({ image })
})

export const deletePropertyImageHandler = wrap(async (req: Request, res: Response) => {
  const propertyId = typeof req.params.id === 'string' ? req.params.id : ''
  const imageId = typeof req.params.imageId === 'string' ? req.params.imageId : ''
  const result = await deletePropertyImage(prisma, getObjectStorage(), propertyId, imageId)
  res.json(result)
})