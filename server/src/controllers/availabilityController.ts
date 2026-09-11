import { Request, Response } from 'express'
import { checkAvailability, getBlockedDates } from '../services/availabilityService.js'
import { isDateString, nightsBetween } from '../lib/dateUtils.js'
import { validateRange } from '../lib/dateRange.js'
import { parsePositiveInt } from '../lib/validation.js'

const MAX_BLOCKED_WINDOW_DAYS = 400

function queryString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export async function checkAvailabilityHandler(req: Request, res: Response) {
  const propertyId = queryString(req.query.propertyId)
  const checkIn = queryString(req.query.checkIn)
  const checkOut = queryString(req.query.checkOut)
  const guests = parsePositiveInt(req.query.guests) ?? 1

  if (!propertyId) {
    return res.status(400).json({ error: 'propertyId is required' })
  }

  const rangeError = validateRange(checkIn, checkOut)
  if (rangeError) {
    return res.status(400).json({ error: rangeError })
  }

  const result = await checkAvailability({
    propertyId,
    checkIn: checkIn as string,
    checkOut: checkOut as string,
    guests,
  })

  if (result.reason === 'not_found') {
    return res.status(404).json({ error: 'Property not found' })
  }

  res.json({ available: result.available, nights: result.nights })
}

export async function blockedDatesHandler(req: Request, res: Response) {
  const propertyId = queryString(req.query.propertyId)
  const from = queryString(req.query.from)
  const to = queryString(req.query.to)

  if (!propertyId) {
    return res.status(400).json({ error: 'propertyId is required' })
  }
  if (!from || !to || !isDateString(from) || !isDateString(to)) {
    return res.status(400).json({ error: 'from and to must be valid YYYY-MM-DD dates' })
  }
  if (from > to) {
    return res.status(400).json({ error: 'from must be on or before to' })
  }
  if (nightsBetween(from, to) + 1 > MAX_BLOCKED_WINDOW_DAYS) {
    return res.status(400).json({ error: 'Requested date window is too large' })
  }

  const property = await getBlockedDates(propertyId, from, to)
  res.json({ blockedDates: property })
}