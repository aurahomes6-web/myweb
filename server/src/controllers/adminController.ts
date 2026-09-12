import type { NextFunction, Request, Response } from 'express'
import type { AdminConfig } from '../lib/adminAuth.js'
import { ADMIN_COOKIE_NAME, checkAdminCredentials, clearSessionCookie, issueSession, sessionCookie } from '../lib/adminAuth.js'
import { prisma } from '../lib/db.js'
import { validateCreateBooking } from '../lib/bookingValidation.js'
import { validateAdminAirbnb } from '../lib/airbnbValidation.js'
import { parsePropertyUpdate } from '../lib/propertyValidation.js'
import { BookingStatus } from '../generated/prisma/enums.js'
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  cancelAirbnb,
  cancelBooking,
  createAirbnb,
  deleteAirbnb,
  deleteProperty,
  getAirbnb,
  getBooking,
  listAirbnb,
  listBookings,
  listProperties,
  updateAirbnb,
  updateBooking,
  updateProperty,
} from '../services/adminService.js'

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