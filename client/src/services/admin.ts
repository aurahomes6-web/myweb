import { API_BASE_URL } from '@/config/api'
import type {
  AdminAirbnb,
  AdminAirbnbPayload,
  AdminApiErrorShape,
  AdminBooking,
  AdminProperty,
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
  return request<AdminBooking>(`/bookings/${encodeURIComponent(id)}`)
}

export async function updateAdminBooking(id: string, payload: BookingUpdatePayload): Promise<AdminBooking> {
  return request<AdminBooking>(`/bookings/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export async function cancelAdminBooking(id: string): Promise<AdminBooking> {
  return request<AdminBooking>(`/bookings/${encodeURIComponent(id)}/cancel`, { method: 'POST' })
}

export async function fetchAdminAirbnb(): Promise<AdminAirbnb[]> {
  const body = await request<{ airbnbReservations: AdminAirbnb[] }>('/airbnb')
  return body.airbnbReservations
}

export async function fetchAdminAirbnbItem(id: string): Promise<AdminAirbnb> {
  return request<AdminAirbnb>(`/airbnb/${encodeURIComponent(id)}`)
}

export async function createAdminAirbnb(payload: AdminAirbnbPayload): Promise<AdminAirbnb> {
  return request<AdminAirbnb>('/airbnb', { method: 'POST', body: JSON.stringify(payload) })
}

export async function updateAdminAirbnb(id: string, payload: AdminAirbnbPayload): Promise<AdminAirbnb> {
  return request<AdminAirbnb>(`/airbnb/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export async function cancelAdminAirbnb(id: string): Promise<AdminAirbnb> {
  return request<AdminAirbnb>(`/airbnb/${encodeURIComponent(id)}/cancel`, { method: 'POST' })
}

export async function deleteAdminAirbnb(id: string): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/airbnb/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function fetchAdminProperties(): Promise<AdminProperty[]> {
  const body = await request<{ properties: AdminProperty[] }>('/properties')
  return body.properties
}

export async function updateAdminProperty(id: string, payload: AdminPropertyPayload): Promise<AdminProperty> {
  return request<AdminProperty>(`/properties/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export async function deleteAdminProperty(id: string): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/properties/${encodeURIComponent(id)}`, { method: 'DELETE' })
}