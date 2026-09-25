import { API_BASE_URL } from '@/config/api'
import type {
  ManagerChecklist,
  ManagerConfig,
  ManagerProperty,
  ManagerReportPrepared,
  ManagerSession,
} from '@/types/manager'

/**
 * Manager API client.
 *
 * Talks ONLY to /api/manager. A manager session cookie is not an admin session,
 * so nothing here can reach the admin API, and no admin endpoint is called from
 * anywhere in the manager UI. The WhatsApp number is never sent to the browser:
 * the server composes the report and returns a ready-to-open wa.me link built
 * from the AURA HOMES configuration.
 */
const ENDPOINT = `${API_BASE_URL}/api/manager`

export class ManagerApiError extends Error {
  status: number
  code: string
  details?: Array<{ field: string; message: string }>

  constructor(shape: { error: string; message: string; status: number; details?: Array<{ field: string; message: string }> }) {
    super(shape.message)
    this.name = 'ManagerApiError'
    this.status = shape.status
    this.code = shape.error
    this.details = shape.details
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase()
  const headers = new Headers(init.headers)
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  if (method !== 'GET' && method !== 'HEAD') headers.set('X-Requested-With', 'XMLHttpRequest')

  const response = await fetch(`${ENDPOINT}${path}`, {
    ...init,
    method,
    headers,
    credentials: 'include',
  })

  const json: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const body = (json ?? null) as { error?: string; message?: string; details?: Array<{ field: string; message: string }> } | null
    throw new ManagerApiError({
      status: response.status,
      error: body?.error ?? 'INTERNAL_ERROR',
      message: body?.message ?? 'Something went wrong. Please try again.',
      details: body?.details,
    })
  }
  return json as T
}

export async function managerLogin(username: string, password: string): Promise<ManagerSession> {
  const body = await request<{ manager: ManagerSession }>('/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
  return body.manager
}

export async function managerLogout(): Promise<void> {
  await request<{ ok: boolean }>('/logout', { method: 'POST' })
}

export async function fetchManagerMe(): Promise<ManagerSession> {
  const body = await request<{ ok: boolean; manager: ManagerSession }>('/me')
  return body.manager
}

/** The three homes, in the canonical Penthouse 1 → 2 → 3 order. */
export async function fetchManagerProperties(): Promise<ManagerProperty[]> {
  const body = await request<{ properties: ManagerProperty[] }>('/properties')
  return body.properties
}

/** The active checklist for one home on one day (today, unless a day is given). */
export async function fetchManagerChecklist(
  propertyId: string,
  dateKey?: string
): Promise<ManagerChecklist> {
  const params = new URLSearchParams()
  if (dateKey) params.set('date', dateKey)
  const suffix = params.toString() ? `?${params.toString()}` : ''
  const body = await request<{ checklist: ManagerChecklist }>(
    `/checklist/${encodeURIComponent(propertyId)}${suffix}`
  )
  return body.checklist
}

/** Tick / untick one task for a day. The server decides the day if omitted. */
export async function setManagerChecklistCompletion(
  propertyId: string,
  itemId: string,
  completed: boolean,
  dateKey?: string
): Promise<{ itemId: string; dateKey: string; isCompleted: boolean; completedAt: string | null }> {
  const body = await request<{
    completion: { itemId: string; dateKey: string; isCompleted: boolean; completedAt: string | null }
  }>(`/checklist/${encodeURIComponent(propertyId)}/${encodeURIComponent(itemId)}`, {
    method: 'POST',
    body: JSON.stringify({ completed, ...(dateKey ? { date: dateKey } : {}) }),
  })
  return body.completion
}

export async function fetchManagerConfig(): Promise<ManagerConfig> {
  return request<ManagerConfig>('/config')
}

/**
 * Ask the server to compose the WhatsApp report. The returned URL opens the
 * AURA HOMES conversation with the message pre-filled — the manager still
 * presses send, and no delivery is claimed.
 */
export async function prepareManagerReport(
  propertyId: string,
  message: string
): Promise<ManagerReportPrepared> {
  const body = await request<{ prepared: ManagerReportPrepared }>('/report', {
    method: 'POST',
    body: JSON.stringify({ propertyId, message }),
  })
  return body.prepared
}
