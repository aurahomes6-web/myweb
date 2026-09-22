import { API_BASE_URL } from '@/config/api'
import type {
  AdminAirbnb,
  AdminAirbnbPayload,
  AdminApiErrorShape,
  AdminBooking,
  AdminCleanupResult,
  AdminCoupon,
  AdminCouponPayload,
  AdminImageSlot,
  AdminProperty,
  AdminPropertyImage,
  AdminPropertyPayload,
  BookingUpdatePayload,
} from '@/types/admin'

/**
 * Admin API client.
 *
 * Every request runs with `credentials: 'include'` so the HttpOnly
 * `aura_admin_session` cookie is sent cross-origin (landing site ≠ API site on
 * Vercel). Mutating requests also send the `X-Requested-With` header, which the
 * server requires as its CSRF protection.
 *
 * Nothing in this module is linked from the public site — `/admin/*` routes are
 * only reachable by direct navigation.
 */
export const ADMIN_ENDPOINT = `${API_BASE_URL}/api/admin`

export class AdminApiError extends Error {
  status: number
  code: string
  details?: AdminApiErrorShape['details']

  constructor(shape: AdminApiErrorShape & { status: number }) {
    super(shape.message)
    this.name = 'AdminApiError'
    this.status = shape.status
    this.code = shape.error
    this.details = shape.details
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase()
  const headers = new Headers(init.headers)
  headers.set('Content-Type', 'application/json')
  if (method !== 'GET' && method !== 'HEAD') {
    headers.set('X-Requested-With', 'XMLHttpRequest')
  }

  const response = await fetch(`${ADMIN_ENDPOINT}${path}`, {
    ...init,
    method,
    headers,
    credentials: 'include',
  })

  const json: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const body = (json ?? null) as Partial<AdminApiErrorShape> | null
    throw new AdminApiError({
      status: response.status,
      error: body?.error ?? 'INTERNAL_ERROR',
      message: body?.message ?? 'Request failed. Please try again.',
      details: body?.details,
    })
  }
  return json as T
}

export interface AdminMe {
  username: string
  loggedInAt: string
  expiresAt: string
}

export async function adminLogin(username: string, password: string): Promise<AdminMe> {
  return request<AdminMe>('/login', { method: 'POST', body: JSON.stringify({ username, password }) })
}

export async function adminLogout(): Promise<void> {
  await request<{ ok: boolean }>('/logout', { method: 'POST' })
}

export async function fetchAdminMe(): Promise<AdminMe> {
  return request<AdminMe>('/me')
}

export async function fetchAdminBookings(): Promise<AdminBooking[]> {
  const body = await request<{ bookings: AdminBooking[] }>('/bookings')
  return body.bookings
}

export async function fetchAdminBooking(id: string): Promise<AdminBooking> {
  const body = await request<{ booking: AdminBooking }>(`/bookings/${encodeURIComponent(id)}`)
  return body.booking
}

export async function updateAdminBooking(id: string, payload: BookingUpdatePayload): Promise<AdminBooking> {
  const body = await request<{ booking: AdminBooking }>(`/bookings/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
  return body.booking
}

export async function cancelAdminBooking(id: string): Promise<AdminBooking> {
  const body = await request<{ booking: AdminBooking }>(`/bookings/${encodeURIComponent(id)}/cancel`, { method: 'POST' })
  return body.booking
}

export async function fetchAdminAirbnb(): Promise<AdminAirbnb[]> {
  const body = await request<{ airbnbReservations: AdminAirbnb[] }>('/airbnb')
  return body.airbnbReservations
}

export async function fetchAdminAirbnbItem(id: string): Promise<AdminAirbnb> {
  const body = await request<{ reservation: AdminAirbnb }>(`/airbnb/${encodeURIComponent(id)}`)
  return body.reservation
}

export async function createAdminAirbnb(payload: AdminAirbnbPayload): Promise<AdminAirbnb> {
  const body = await request<{ reservation: AdminAirbnb }>('/airbnb', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return body.reservation
}

export async function updateAdminAirbnb(id: string, payload: AdminAirbnbPayload): Promise<AdminAirbnb> {
  const body = await request<{ reservation: AdminAirbnb }>(`/airbnb/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
  return body.reservation
}

export async function cancelAdminAirbnb(id: string): Promise<AdminAirbnb> {
  const body = await request<{ reservation: AdminAirbnb }>(`/airbnb/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
  })
  return body.reservation
}

export async function deleteAdminAirbnb(id: string): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/airbnb/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function fetchAdminProperties(): Promise<AdminProperty[]> {
  const body = await request<{ properties: AdminProperty[] }>('/properties')
  return body.properties
}

export async function updateAdminProperty(id: string, payload: AdminPropertyPayload): Promise<AdminProperty> {
  const body = await request<{ property: AdminProperty }>(`/properties/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
  return body.property
}

export async function deleteAdminProperty(id: string): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/properties/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

// ── property photos (Phase 5) ──────────────────────────────────────────────
//
// Uploads are real multipart/form-data (`image` field + `slot` + optional
// `alt`). The browser sets the multipart boundary, so the CSRF header travels
// as a plain header exactly like every other admin mutation.

function parseAdminError(json: unknown, fallback: string): AdminApiError {
  const body = (json ?? null) as Partial<AdminApiErrorShape> | null
  return new AdminApiError({
    status: 400,
    error: body?.error ?? 'INTERNAL_ERROR',
    message: body?.message ?? fallback,
    details: body?.details,
  })
}

export async function uploadAdminPropertyImage(
  propertyId: string,
  slot: AdminImageSlot,
  file: File,
  alt = ''
): Promise<AdminPropertyImage> {
  const form = new FormData()
  form.append('image', file)
  form.append('slot', slot)
  if (alt.trim()) form.append('alt', alt.trim())

  const response = await fetch(
    `${ADMIN_ENDPOINT}/properties/${encodeURIComponent(propertyId)}/images`,
    {
      method: 'POST',
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
      credentials: 'include',
      body: form,
    }
  )
  const json: unknown = await response.json().catch(() => null)
  if (!response.ok) throw parseAdminError(json, 'Image upload failed. Please check the file and try again.')
  return (json as { image: AdminPropertyImage }).image
}

export async function deleteAdminPropertyImage(propertyId: string, imageId: string): Promise<{ ok: true }> {
  return request<{ ok: true }>(
    `/properties/${encodeURIComponent(propertyId)}/images/${encodeURIComponent(imageId)}`,
    { method: 'DELETE' }
  )
}

// ── coupons (Phase 5) ──────────────────────────────────────────────────────
//
// Exact endpoints and payload shapes mirror server/src/routes/admin.ts and the
// couponService DTO. Discount values are paise for FIXED and whole percents
// for PERCENTAGE.

export async function fetchAdminCoupons(): Promise<AdminCoupon[]> {
  const body = await request<{ coupons: AdminCoupon[] }>('/coupons')
  return body.coupons
}

export async function createAdminCoupon(payload: AdminCouponPayload): Promise<AdminCoupon> {
  const body = await request<{ coupon: AdminCoupon }>('/coupons', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return body.coupon
}

export async function setAdminCouponActive(id: string, active: boolean): Promise<AdminCoupon> {
  const body = await request<{ coupon: AdminCoupon }>(`/coupons/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ active }),
  })
  return body.coupon
}

export async function deleteAdminCoupon(id: string): Promise<{ deleted: true }> {
  return request<{ deleted: true }>(`/coupons/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

// ── database cleanup ────────────────────────────────────────────────────────
//
// Destructive maintenance. The server requires the exact confirmation phrase
// plus the CSRF header (sent automatically above) and a valid admin session.

async function runCleanup(path: string, confirm: string): Promise<AdminCleanupResult> {
  const body = await request<{ ok: true; result: AdminCleanupResult }>(path, {
    method: 'POST',
    body: JSON.stringify({ confirm }),
  })
  return body.result
}

export function cleanupAdminBookings(): Promise<AdminCleanupResult> {
  return runCleanup('/cleanup/bookings', 'DELETE')
}

export function cleanupAdminAirbnb(): Promise<AdminCleanupResult> {
  return runCleanup('/cleanup/airbnb', 'DELETE')
}

export function cleanupAdminBlockedDates(): Promise<AdminCleanupResult> {
  return runCleanup('/cleanup/blocked-dates', 'DELETE')
}

export function cleanupAdminAllData(): Promise<AdminCleanupResult> {
  return runCleanup('/cleanup/all', 'DELETE ALL')
}