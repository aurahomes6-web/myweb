import type { AvailabilityCheckRequest, AvailabilityResult, PropertySlug } from '@/types'
import { addDays, toISODate, today } from '@/lib/date'

/**
 * TEMPORARY mock availability engine.
 *
 * This file backs the UI only, so the full availability experience (calendar
 * blocking, available/unavailable states, nights count) can be demonstrated
 * before the real booking engine exists. The public interface lives in
 * `@/services/availability` and mirror the future `GET /api/availability`
 * endpoint, so swapping this module for a real API call requires no component
 * changes.
 */

/** Deterministic week "booked" pattern, rotated per property. */
const BOOKED_PATTERN = [false, false, true, false, false, false, true, false, false]

const PATTERN_OFFSET: Record<PropertySlug, number> = {
  'aura-cozy-penthouse-1': 0,
  'aura-cozy-penthouse-2': 3,
  'aura-cozy-penthouse-3': 6,
}

/**
 * Explicit booked windows expressed in days from today, so a reproducible
 * "unavailable" case exists for each property (e.g. PH1 is unavailable for a
 * stay covering today +4..+6).
 */
const DEMO_BOOKED_WINDOWS: Record<PropertySlug, Array<readonly [number, number]>> = {
  'aura-cozy-penthouse-1': [[4, 6]],
  'aura-cozy-penthouse-2': [[7, 9]],
  'aura-cozy-penthouse-3': [[2, 3]],
}

const MOCK_LATENCY_MS = 550

function dayIndexFromToday(iso: string): number {
  const start = today().getTime()
  const day = new Date(`${iso}T00:00:00`).getTime()
  return Math.round((day - start) / 86_400_000)
}

export function isDateBlocked(propertyId: PropertySlug, iso: string): boolean {
  const dayNo = dayIndexFromToday(iso)
  if (dayNo < 0) return true
  if (DEMO_BOOKED_WINDOWS[propertyId].some(([from, to]) => dayNo >= from && dayNo <= to)) {
    return true
  }
  const offset = PATTERN_OFFSET[propertyId]
  return BOOKED_PATTERN[((offset + dayNo) % BOOKED_PATTERN.length + BOOKED_PATTERN.length) % BOOKED_PATTERN.length]
}

export function getMockBlockedDates(
  propertyId: PropertySlug,
  fromISO: string,
  toISO: string
): string[] {
  const blocked: string[] = []
  const cursor = new Date(`${fromISO}T00:00:00`)
  const end = new Date(`${toISO}T00:00:00`)
  if (Number.isNaN(cursor.getTime()) || Number.isNaN(end.getTime())) return blocked

  let current = cursor
  while (current.getTime() <= end.getTime()) {
    const iso = toISODate(current)
    if (isDateBlocked(propertyId, iso)) blocked.push(iso)
    current = addDays(current, 1)
  }
  return blocked
}

export async function mockCheckAvailability(
  request: AvailabilityCheckRequest
): Promise<AvailabilityResult> {
  await new Promise((resolve) => setTimeout(resolve, MOCK_LATENCY_MS))

  const checkIn = new Date(`${request.checkIn}T00:00:00`)
  const checkOut = new Date(`${request.checkOut}T00:00:00`)
  const nights = Math.round((checkOut.getTime() - checkIn.getTime()) / 86_400_000)

  if (nights <= 0) return { available: false, nights }

  let anyBlocked = false
  const cursor = new Date(checkIn)
  while (cursor.getTime() < checkOut.getTime()) {
    if (isDateBlocked(request.propertyId, toISODate(cursor))) {
      anyBlocked = true
      break
    }
    cursor.setDate(cursor.getDate() + 1)
  }

  return { available: !anyBlocked, nights }
}