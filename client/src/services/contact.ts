import { useEffect, useState } from 'react'
import { API_BASE_URL } from '@/config/api'
import { DEFAULT_CONTACT, normalizeContact } from '@/lib/contactFormat'
import type { ContactInfo } from '@/types'

/**
 * Public contact service.
 *
 *   GET /api/contact → { email, phone, description }
 *
 * Follows the established public-data pattern (see `services/properties.ts`):
 * a module-level cache plus an offline fallback (the footer's current values)
 * so the site renders instantly and never shows blank content while the API is
 * down.
 */

let cached: ContactInfo | null = null

export async function fetchContact(): Promise<ContactInfo> {
  if (cached) return cached
  try {
    const response = await fetch(`${API_BASE_URL}/api/contact`)
    if (!response.ok) throw new Error(`Contact API returned ${response.status}`)
    const json: unknown = await response.json().catch(() => null)
    cached = normalizeContact(json)
    return cached
  } catch {
    cached = DEFAULT_CONTACT
    return cached
  }
}

export interface ContactState {
  contact: ContactInfo
  /** `loading` until the first API response resolves; fallback values render meanwhile. */
  status: 'loading' | 'ready'
}

export function useContact(): ContactState {
  const [state, setState] = useState<ContactState>({
    contact: DEFAULT_CONTACT,
    status: 'loading',
  })

  useEffect(() => {
    let active = true
    fetchContact().then((contact) => {
      if (active) setState({ contact, status: 'ready' })
    })
    return () => {
      active = false
    }
  }, [])

  return state
}