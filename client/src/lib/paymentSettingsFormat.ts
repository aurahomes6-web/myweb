import type { PaymentSettingsInfo } from '@/types'

/**
 * Payment-settings → display mapping for the customer payment page.
 *
 * The active values always come from GET /api/payment-settings (admin-editable).
 * These constants are the migration-safe DEFAULT: the exact UPI details the
 * site shipped with, plus the static `/qr.jpeg` asset. They are used:
 * - as the offline/error fallback so the payment page never renders blank, and
 * - to fill any missing fields from a partial API response.
 */

/** Static QR asset served by the landing site — used until an admin uploads a durable Blob QR. */
export const UPI_QR_FALLBACK_PATH = '/qr.jpeg'

export const UPI_QR_DOWNLOAD_NAME = 'aura-homes-upi-qr.jpeg'

export const DEFAULT_PAYMENT_SETTINGS: PaymentSettingsInfo = Object.freeze({
  upiName: 'R BALAKUMARAN',
  upiId: '9900662111@jupiteraxis',
  upiPhone: '+91 9900662111',
  qrCodeUrl: UPI_QR_FALLBACK_PATH,
})

/** Fill missing/blank fields from the fallback so a partial response still renders. */
export function normalizePaymentSettings(raw: unknown): PaymentSettingsInfo {
  const value = (raw ?? {}) as Record<string, unknown>
  return {
    upiName:
      typeof value.upiName === 'string' && value.upiName.trim()
        ? value.upiName.trim()
        : DEFAULT_PAYMENT_SETTINGS.upiName,
    upiId:
      typeof value.upiId === 'string' && value.upiId.trim()
        ? value.upiId.trim()
        : DEFAULT_PAYMENT_SETTINGS.upiId,
    upiPhone:
      typeof value.upiPhone === 'string' && value.upiPhone.trim()
        ? value.upiPhone.trim()
        : DEFAULT_PAYMENT_SETTINGS.upiPhone,
    qrCodeUrl:
      typeof value.qrCodeUrl === 'string' && value.qrCodeUrl.trim()
        ? value.qrCodeUrl.trim()
        : UPI_QR_FALLBACK_PATH,
  }
}