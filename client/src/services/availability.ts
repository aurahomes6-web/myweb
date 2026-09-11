import type { AvailabilityCheckRequest, AvailabilityResult, PropertySlug } from '@/types'
import { API_BASE_URL } from '@/config/api'

/**
 * Public availability service.
 *
 * The UI imports availability from this module only. Requests flow to the
 * AURA HOMES API (Express), which answers from the Supabase-hosted PostgreSQL
 * database via Prisma:
 *
 *   GET /api/availability?propertyId=:propertyId&checkIn=:checkIn&checkOut=:checkOut&guests=:guests
 *     → { available: boolean, nights: number }
 *
 *   GET /api/availability/blocked?propertyId=:propertyId&from=:from&to=:to
 *     → { blockedDates: string[] }
 *
 * The Vite dev server proxies `/api` to the API server (see vite.config.ts).
 */
export const AVAILABILITY_ENDPOINT = `${API_BASE_URL}/api/availability`

export interface BlockedDatesQuery {
  propertyId: PropertySlug
  from: string
  to: string
}

interface BlockedDatesResponse {
  blockedDates: string[]
}

async function unwrap<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`Availability request failed with status ${response.status}`)
  }
  return (await response.json()) as T
}

export async function checkAvailability(
  request: AvailabilityCheckRequest
): Promise<AvailabilityResult> {
  const params = new URLSearchParams({
    propertyId: request.propertyId,
    checkIn: request.checkIn,
    checkOut: request.checkOut,
    guests: String(request.guests),
  })
  return unwrap<AvailabilityResult>(
    await fetch(`${AVAILABILITY_ENDPOINT}?${params.toString()}`)
  )
}

export async function fetchBlockedDates(query: BlockedDatesQuery): Promise<string[]> {
  const params = new URLSearchParams({
    propertyId: query.propertyId,
    from: query.from,
    to: query.to,
  })
  const data = await unwrap<BlockedDatesResponse>(
    await fetch(`${AVAILABILITY_ENDPOINT}/blocked?${params.toString()}`)
  )
  return data.blockedDates
}