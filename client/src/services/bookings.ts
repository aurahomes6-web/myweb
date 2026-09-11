import type {
  BookingApiErrorShape,
  BookingErrorCode,
  BookingFormData,
  BookingResponse,
} from '@/types'

/**
 * Public booking service.
 *
 * The booking form submits through this module only. Requests flow to the
 * AURA HOMES API (Express), which stores the confirmed booking and per-guest
 * registration in Supabase via Prisma:
 *
 *   POST /api/bookings        → Create a booking        (201 / 400 / 404 / 409 / 500)
 *   GET  /api/bookings/:id    → Public booking lookup   (no Aadhaar ever returned)
 *
 * The Vite dev server proxies `/api` to the API server (see vite.config.ts).
 */
export const BOOKINGS_ENDPOINT = '/api/bookings'

export class BookingApiError extends Error {
  status: number
  code: BookingErrorCode
  details?: BookingApiErrorShape['details']

  constructor(shape: BookingApiErrorShape & { status: number }) {
    super(shape.message)
    this.name = 'BookingApiError'
    this.status = shape.status
    this.code = shape.error
    this.details = shape.details
  }
}

async function unwrap<T>(response: Response): Promise<T> {
  const json: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const body = (json ?? null) as Partial<BookingApiErrorShape> | null
    throw new BookingApiError({
      status: response.status,
      error: body?.error ?? 'INTERNAL_ERROR',
      message: body?.message ?? 'Something went wrong. Please try again.',
      details: body?.details,
    })
  }
  return json as T
}

export async function createBooking(request: BookingFormData): Promise<BookingResponse> {
  const response = await fetch(BOOKINGS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  return unwrap<BookingResponse>(response)
}

export async function fetchBooking(reference: string): Promise<BookingResponse> {
  const response = await fetch(
    `${BOOKINGS_ENDPOINT}/${encodeURIComponent(reference)}`
  )
  return unwrap<BookingResponse>(response)
}