import { API_BASE_URL } from '@/config/api'
import type { AdminApiErrorShape } from '@/types/admin'
import type {
  DetailsFilters,
  DetailsResponse,
  DetailsSortField,
  DetailsSortOrder,
} from '@/types/details'

/**
 * Admin → Details API client.
 *
 * Everything is filtered, sorted and paginated SERVER-SIDE: the browser only
 * ever holds one page. The two downloads use the identical query, so a file
 * always matches exactly what the table is showing.
 *
 * Requests carry the `aura_admin_session` cookie (`credentials: 'include'`) and
 * the exports add `X-Requested-With`, which the server requires for anything
 * that returns full Aadhaar numbers.
 */
const ENDPOINT = `${API_BASE_URL}/api/admin/details`

export class DetailsApiError extends Error {
  status: number
  code: string
  details?: AdminApiErrorShape['details']

  constructor(shape: AdminApiErrorShape & { status: number }) {
    super(shape.message)
    this.name = 'DetailsApiError'
    this.status = shape.status
    this.code = shape.error
    this.details = shape.details
  }
}

function asError(json: unknown, status: number, fallback: string): DetailsApiError {
  const body = (json ?? null) as Partial<AdminApiErrorShape> | null
  return new DetailsApiError({
    status,
    error: body?.error ?? 'INTERNAL_ERROR',
    message: body?.message ?? fallback,
    details: body?.details,
  })
}

/** Serialise the active filters into the query string the server expects. */
export function buildDetailsQueryString(filters: DetailsFilters): string {
  const params = new URLSearchParams()
  params.set('source', filters.source)
  params.set('dateBasis', filters.dateBasis)
  params.set('range', filters.preset)
  params.set('sortBy', filters.sortBy)
  params.set('sortOrder', filters.sortOrder)
  params.set('page', String(filters.page))
  params.set('pageSize', String(filters.pageSize))

  if (filters.propertyId) params.set('propertyId', filters.propertyId)
  if (filters.status) params.set('status', filters.status)
  if (filters.paymentStatus) params.set('paymentStatus', filters.paymentStatus)
  if (filters.search.trim()) params.set('search', filters.search.trim())
  if (filters.preset === 'custom') {
    if (filters.dateFrom) params.set('dateFrom', filters.dateFrom)
    if (filters.dateTo) params.set('dateTo', filters.dateTo)
  }
  return params.toString()
}

export async function fetchDetails(filters: DetailsFilters): Promise<DetailsResponse> {
  const response = await fetch(`${ENDPOINT}?${buildDetailsQueryString(filters)}`, {
    credentials: 'include',
  })
  const json: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    throw asError(json, response.status, 'Could not load booking details. Please try again.')
  }
  return json as DetailsResponse
}

export interface DetailsExportFormat {
  format: 'excel' | 'pdf'
  fileName: string
  blob: Blob
}

/**
 * The response filename is rebuilt from the range the server reported in
 * `appliedQuery.range`, so no cross-origin `Content-Disposition` header has to
 * be readable. It always matches the name the server sent.
 */
export function detailsExportFileName(format: 'excel' | 'pdf', range: { from: string; to: string }): string {
  return `AURA_HOMES_BOOKING_DETAILS_${range.from}_TO_${range.to}.${format === 'excel' ? 'xlsx' : 'pdf'}`
}

async function download(
  format: 'excel' | 'pdf',
  filters: DetailsFilters,
  range: { from: string; to: string }
): Promise<DetailsExportFormat> {
  const response = await fetch(`${ENDPOINT}/export/${format}?${buildDetailsQueryString(filters)}`, {
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
    credentials: 'include',
  })
  if (!response.ok) {
    const json: unknown = await response.json().catch(() => null)
    throw asError(json, response.status, 'Could not generate the file. Please try again.')
  }

  const contentType = response.headers.get('Content-Type') ?? ''
  if (contentType.includes('application/json')) {
    const body = (await response.json()) as { message?: string }
    throw new DetailsApiError({
      status: 400,
      error: 'EMPTY_REPORT',
      message: body.message ?? 'There is nothing to export for the selected filters.',
    })
  }

  return {
    format,
    fileName: detailsExportFileName(format, range),
    blob: await response.blob(),
  }
}

export function downloadDetailsExcel(
  filters: DetailsFilters,
  range: { from: string; to: string }
): Promise<DetailsExportFormat> {
  return download('excel', filters, range)
}

export function downloadDetailsPdf(
  filters: DetailsFilters,
  range: { from: string; to: string }
): Promise<DetailsExportFormat> {
  return download('pdf', filters, range)
}

/** Save a returned blob using a temporary anchor (same approach as the booking report). */
export function saveBlob(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

/** Human label for a sort field, used in the table headers. */
export const DETAILS_SORT_FIELD_LABEL: Record<DetailsSortField, string> = {
  checkIn: 'Check-in',
  checkOut: 'Check-out',
  bookingDate: 'Booking Date',
  guestName: 'Guest',
  property: 'Property',
  source: 'Source',
  status: 'Status',
  amount: 'Amount',
}

export type { DetailsSortOrder }
