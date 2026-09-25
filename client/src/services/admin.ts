import { API_BASE_URL } from '@/config/api'
import type {
  AdminAirbnb,
  AdminAirbnbPayload,
  AdminApiErrorShape,
  AdminBooking,
  AdminBookingDateBlock,
  AdminBookingDateBlockPayload,
  AdminCleanupResult,
  AdminContactSettings,
  AdminCoupon,
  AdminCouponPayload,
  AdminHomepageSettings,
  AdminImageSlot,
  AdminMarqueeNotification,
  AdminMarqueeNotificationPayload,
  AdminManagerChecklistItem,
  AdminManagerChecklistItemInput,
  AdminManagerChecklistItemUpdate,
  AdminPayment,
  AdminPaymentSettings,
  AdminProperty,
  AdminPropertyImage,
  AdminPropertyPayload,
  AdminPropertySpace,
  AdminPropertySpacePayload,
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

export async function fetchAdminBookingDateBlocks(id: string): Promise<AdminBookingDateBlock[]> {
  const body = await request<{ blocks: AdminBookingDateBlock[] }>(
    `/properties/${encodeURIComponent(id)}/date-blocks`
  )
  return body.blocks
}

export async function createAdminBookingDateBlock(
  id: string,
  payload: AdminBookingDateBlockPayload
): Promise<AdminBookingDateBlock> {
  const body = await request<{ block: AdminBookingDateBlock }>(
    `/properties/${encodeURIComponent(id)}/date-blocks`,
    { method: 'POST', body: JSON.stringify(payload) }
  )
  return body.block
}

export async function deleteAdminBookingDateBlock(
  id: string,
  blockId: string
): Promise<void> {
  await request<{ ok: true }>(
    `/properties/${encodeURIComponent(id)}/date-blocks/${encodeURIComponent(blockId)}`,
    { method: 'DELETE' }
  )
}

// ── THE SPACE (properties) ──────────────────────────────────────────────────
//
// Each property owns its own capacity range + ordered attribute cards. Keys are
// documented in `types/admin.ts`; the server validates everything in
// `server/src/lib/spaceValidation.ts`.

export async function fetchAdminPropertySpace(id: string): Promise<AdminPropertySpace> {
  const body = await request<{ space: AdminPropertySpace }>(
    `/properties/${encodeURIComponent(id)}/space`
  )
  return body.space
}

/** Full replace: add / edit / delete / reorder in a single save. */
export async function updateAdminPropertySpace(
  id: string,
  payload: AdminPropertySpacePayload
): Promise<AdminPropertySpace> {
  const body = await request<{ space: AdminPropertySpace }>(
    `/properties/${encodeURIComponent(id)}/space`,
    { method: 'PUT', body: JSON.stringify(payload) }
  )
  return body.space
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

// ── global contact settings ─────────────────────────────────────────────────

export async function fetchAdminContactSettings(): Promise<AdminContactSettings> {
  const body = await request<{ contact: AdminContactSettings }>('/contact')
  return body.contact
}

export async function updateAdminContactSettings(
  payload: AdminContactSettings
): Promise<AdminContactSettings> {
  const body = await request<{ contact: AdminContactSettings }>('/contact', {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
  return body.contact
}

export async function fetchAdminHomepageSettings(): Promise<AdminHomepageSettings> {
  const body = await request<{ settings: AdminHomepageSettings }>('/homepage-settings')
  return body.settings
}

export async function updateAdminHomepageSettings(
  visualImageAlt: string
): Promise<AdminHomepageSettings> {
  const body = await request<{ settings: AdminHomepageSettings }>('/homepage-settings', {
    method: 'PUT',
    body: JSON.stringify({ visualImageAlt }),
  })
  return body.settings
}

export async function uploadAdminHomepageVisual(file: File): Promise<AdminHomepageSettings> {
  const form = new FormData()
  form.append('image', file)

  const response = await fetch(`${ADMIN_ENDPOINT}/homepage-settings/visual`, {
    method: 'POST',
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
    credentials: 'include',
    body: form,
  })
  const json: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    throw parseAdminError(json, 'The homepage visual could not be uploaded. Please try again.')
  }
  return (json as { settings: AdminHomepageSettings }).settings
}

export async function resetAdminHomepageVisual(): Promise<AdminHomepageSettings> {
  const body = await request<{ settings: AdminHomepageSettings }>('/homepage-settings/visual', {
    method: 'DELETE',
  })
  return body.settings
}

export async function fetchAdminMarqueeNotifications(): Promise<AdminMarqueeNotification[]> {
  const body = await request<{ notifications: AdminMarqueeNotification[] }>(
    '/marquee-notifications'
  )
  return body.notifications
}

export async function createAdminMarqueeNotification(
  payload: Required<AdminMarqueeNotificationPayload>
): Promise<AdminMarqueeNotification> {
  const body = await request<{ notification: AdminMarqueeNotification }>('/marquee-notifications', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return body.notification
}

export async function updateAdminMarqueeNotification(
  id: string,
  payload: AdminMarqueeNotificationPayload
): Promise<AdminMarqueeNotification> {
  const body = await request<{ notification: AdminMarqueeNotification }>(
    `/marquee-notifications/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }
  )
  return body.notification
}

export async function reorderAdminMarqueeNotifications(
  ids: string[]
): Promise<AdminMarqueeNotification[]> {
  const body = await request<{ notifications: AdminMarqueeNotification[] }>(
    '/marquee-notifications/reorder',
    {
      method: 'PUT',
      body: JSON.stringify({ ids }),
    }
  )
  return body.notifications
}

export async function deleteAdminMarqueeNotification(id: string): Promise<void> {
  await request<{ deleted: true }>(`/marquee-notifications/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

// ── manager checklist configuration (Admin → Manager) ──────────────────────
//
// This is CONFIGURATION for the manager panel. It deliberately contains no link
// or button into /manager: the manager panel is intentionally unlinked and is
// only reachable by typing the path.

export async function fetchAdminManagerChecklist(
  propertyId: string
): Promise<AdminManagerChecklistItem[]> {
  const body = await request<{ items: AdminManagerChecklistItem[] }>(
    `/manager/checklist/${encodeURIComponent(propertyId)}`
  )
  return body.items
}

export async function createAdminManagerChecklistItem(
  propertyId: string,
  payload: AdminManagerChecklistItemInput
): Promise<AdminManagerChecklistItem> {
  const body = await request<{ item: AdminManagerChecklistItem }>(
    `/manager/checklist/${encodeURIComponent(propertyId)}`,
    { method: 'POST', body: JSON.stringify(payload) }
  )
  return body.item
}

export async function updateAdminManagerChecklistItem(
  propertyId: string,
  itemId: string,
  payload: AdminManagerChecklistItemUpdate
): Promise<AdminManagerChecklistItem> {
  const body = await request<{ item: AdminManagerChecklistItem }>(
    `/manager/checklist/${encodeURIComponent(propertyId)}/${encodeURIComponent(itemId)}`,
    { method: 'PATCH', body: JSON.stringify(payload) }
  )
  return body.item
}

export async function deleteAdminManagerChecklistItem(
  propertyId: string,
  itemId: string
): Promise<{ deleted: true; retainedCompletionRecords: number }> {
  return request<{ deleted: true; retainedCompletionRecords: number }>(
    `/manager/checklist/${encodeURIComponent(propertyId)}/${encodeURIComponent(itemId)}`,
    { method: 'DELETE' }
  )
}

export async function reorderAdminManagerChecklist(
  propertyId: string,
  ids: string[]
): Promise<AdminManagerChecklistItem[]> {
  const body = await request<{ items: AdminManagerChecklistItem[] }>(
    `/manager/checklist/${encodeURIComponent(propertyId)}/reorder`,
    { method: 'PUT', body: JSON.stringify({ ids }) }
  )
  return body.items
}

// ── UPI payments (Phase 7) ──────────────────────────────────────────────────
//
// The payment ledger is the set of bookings with a recorded `paymentStatus`.
// Accepting confirms a PENDING transfer; rejecting one cancels the booking and
// releases the dates. The UTR is only ever surfaced inside this admin section.

export async function fetchAdminPayments(): Promise<AdminPayment[]> {
  const body = await request<{ payments: AdminPayment[] }>('/payments')
  return body.payments
}

export async function acceptAdminPayment(id: string): Promise<AdminPayment> {
  const body = await request<{ payment: AdminPayment }>(
    `/payments/${encodeURIComponent(id)}/accept`,
    { method: 'POST' }
  )
  return body.payment
}

export async function rejectAdminPayment(
  id: string,
  rejectionMessage?: string
): Promise<AdminPayment> {
  const body = await request<{ payment: AdminPayment }>(
    `/payments/${encodeURIComponent(id)}/reject`,
    { method: 'POST', body: JSON.stringify({ rejectionMessage }) }
  )
  return body.payment
}

// ── Direct-UPI payment settings ─────────────────────────────────────────────
//
// Payee name/id/phone and the active QR asset shown on the customer payment
// page. Text details are saved as JSON (PUT); the QR is a multipart image
// upload (POST /qr) that the server persists to Vercel Blob and returns as a
// public URL. Both use the same session cookie + CSRF header as every admin
// mutation.

export async function fetchAdminPaymentSettings(): Promise<AdminPaymentSettings> {
  const body = await request<{ settings: AdminPaymentSettings }>('/payment-settings')
  return body.settings
}

export async function updateAdminPaymentSettings(
  payload: Pick<AdminPaymentSettings, 'upiName' | 'upiId' | 'upiPhone'>
): Promise<AdminPaymentSettings> {
  const body = await request<{ settings: AdminPaymentSettings }>('/payment-settings', {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
  return body.settings
}

export async function uploadAdminPaymentQr(file: File): Promise<AdminPaymentSettings> {
  const form = new FormData()
  form.append('image', file)

  const response = await fetch(`${ADMIN_ENDPOINT}/payment-settings/qr`, {
    method: 'POST',
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
    credentials: 'include',
    body: form,
  })
  const json: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    throw parseAdminError(json, 'The QR image could not be uploaded. Please try again.')
  }
  return (json as { settings: AdminPaymentSettings }).settings
}

// ── booking report download ──────────────────────────────────────────────────
//
// GET streams an .xlsx when bookings exist in the range, or a JSON marker when
// the period is empty. The endpoint requires the session cookie AND the CSRF
// header (sent below), and the filename is deterministic from the range, so the
// client never needs to read a cross-origin header.

export interface BookingReportRange {
  from: string
  to: string
}

export type BookingReportResult =
  | { status: 'downloaded'; fileName: string; blob: Blob }
  | { status: 'empty'; message: string }

export async function downloadBookingReport(range: BookingReportRange): Promise<BookingReportResult> {
  const params = new URLSearchParams({ from: range.from, to: range.to })
  const response = await fetch(`${ADMIN_ENDPOINT}/reports/bookings?${params.toString()}`, {
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
    credentials: 'include',
  })

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as Partial<AdminApiErrorShape> | null
    throw new AdminApiError({
      status: response.status,
      error: body?.error ?? 'INTERNAL_ERROR',
      message: body?.message ?? 'Could not generate the report. Please try again.',
      details: body?.details,
    })
  }

  const contentType = response.headers.get('Content-Type') ?? ''
  if (contentType.includes('application/json')) {
    const body = (await response.json()) as { empty?: boolean; message?: string }
    return {
      status: 'empty',
      message: body.message ?? 'No bookings found for the selected period.',
    }
  }

  const blob = await response.blob()
  return {
    status: 'downloaded',
    fileName: `AURA_HOMES_BOOKINGS_${range.from}_TO_${range.to}.xlsx`,
    blob,
  }
}