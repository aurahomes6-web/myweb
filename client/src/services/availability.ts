import type { AvailabilityCheckRequest, AvailabilityResult, PropertySlug } from '@/types'
import {
  getMockBlockedDates,
  mockCheckAvailability,
} from '@/services/mockAvailability'

/**
 * Public availability service.
 *
 * The UI imports availability from this module only. Once the real booking
 * engine ships, the mock resolution below is replaced with the API:
 *
 *   GET /api/availability?propertyId=:propertyId&checkIn=:checkIn&checkOut=:checkOut
 *     → { available: boolean, nights: number }
 *
 *   GET /api/availability/blocked?propertyId=:propertyId&from=:from&to=:to
 *     → { blockedDates: string[] }
 *
 * The request/response shapes already match those contracts, so no component
 * changes are required when the swap happens.
 */
export const AVAILABILITY_ENDPOINT = '/api/availability'

export interface BlockedDatesQuery {
  propertyId: PropertySlug
  from: string
  to: string
}

export function checkAvailability(
  request: AvailabilityCheckRequest
): Promise<AvailabilityResult> {
  return mockCheckAvailability(request)
}

export function fetchBlockedDates(query: BlockedDatesQuery): Promise<string[]> {
  return Promise.resolve(getMockBlockedDates(query.propertyId, query.from, query.to))
}