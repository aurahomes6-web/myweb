import type {
  AirbnbDetailsResult,
  AirbnbFormData,
  BookingApiErrorShape,
  BookingErrorCode,
} from '@/types'
import { API_BASE_URL } from '@/config/api'

/**
 * Airbnb reservation-details → WhatsApp (Phase 7).
 *
 * This flow is stateless: `POST /api/airbnb/details` validates the customer's
 * Airbnb reservation information and returns the WhatsApp message plus the
 * recipient number for a click-to-chat link. That message carries each guest's
 * full Aadhaar for the customer's own documentary send — it is returned only
 * inside this submission response and never stored anywhere. The reservation
 * number is optional. This flow never creates a website booking and never
 * generates an AURA booking ID.
 */
export const AIRBNB_ENDPOINT = `${API_BASE_URL}/api/airbnb/details`

export class AirbnbApiError extends Error {
  status: number
  code: BookingErrorCode
  details?: BookingApiErrorShape['details']

  constructor(shape: BookingApiErrorShape & { status: number }) {
    super(shape.message)
    this.name = 'AirbnbApiError'
    this.status = shape.status
    this.code = shape.error
    this.details = shape.details
  }
}

export async function submitAirbnbDetails(request: AirbnbFormData): Promise<AirbnbDetailsResult> {
  const response = await fetch(AIRBNB_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })

  const json: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const body = (json ?? null) as Partial<BookingApiErrorShape> | null
    throw new AirbnbApiError({
      status: response.status,
      error: body?.error ?? 'INTERNAL_ERROR',
      message: body?.message ?? 'Something went wrong. Please try again.',
      details: body?.details,
    })
  }
  return json as AirbnbDetailsResult
}