import { useEffect, useState } from 'react'
import { API_BASE_URL } from '@/config/api'
import { DEFAULT_PAYMENT_SETTINGS, normalizePaymentSettings } from '@/lib/paymentSettingsFormat'
import type { PaymentSettingsInfo } from '@/types'

/**
 * Public payment-settings service (customer payment page).
 *
 *   GET /api/payment-settings → { upiName, upiId, upiPhone, qrCodeUrl }
 *
 * Follows the established public-data pattern (see `services/contact.ts`): the
 * site defaults render instantly and remain the offline fallback if the API is
 * unreachable, so the payment page is never left with a broken or missing QR.
 * No module-level cache: each mounted payment step re-fetches so an admin's
 * edit is reflected on the next payment page visit.
 */

export async function fetchPaymentSettings(): Promise<PaymentSettingsInfo> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/payment-settings`)
    if (!response.ok) throw new Error(`Payment settings API returned ${response.status}`)
    const json: unknown = await response.json().catch(() => null)
    return normalizePaymentSettings(json)
  } catch {
    return DEFAULT_PAYMENT_SETTINGS
  }
}

export interface PaymentSettingsState {
  settings: PaymentSettingsInfo
  /** `loading` until the first API response resolves; defaults render meanwhile. */
  status: 'loading' | 'ready'
}

export function usePaymentSettings(): PaymentSettingsState {
  const [state, setState] = useState<PaymentSettingsState>({
    settings: DEFAULT_PAYMENT_SETTINGS,
    status: 'loading',
  })

  useEffect(() => {
    let active = true
    fetchPaymentSettings().then((settings) => {
      if (active) setState({ settings, status: 'ready' })
    })
    return () => {
      active = false
    }
  }, [])

  return state
}