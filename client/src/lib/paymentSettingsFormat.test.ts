import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PAYMENT_SETTINGS,
  UPI_QR_FALLBACK_PATH,
  normalizePaymentSettings,
} from './paymentSettingsFormat'

describe('paymentSettingsFormat — defaults', () => {
  it('exposes the exact UPI details the site ships with', () => {
    expect(DEFAULT_PAYMENT_SETTINGS).toEqual({
      upiName: 'R BALAKUMARAN',
      upiId: '9900662111@jupiteraxis',
      upiPhone: '+91 9900662111',
      qrCodeUrl: UPI_QR_FALLBACK_PATH,
    })
  })

  it('keeps the static /qr.jpeg path as the migration-safe fallback', () => {
    expect(UPI_QR_FALLBACK_PATH).toBe('/qr.jpeg')
  })
})

describe('paymentSettingsFormat — normalizePaymentSettings', () => {
  it('passes through a complete API response', () => {
    const raw = {
      upiName: 'AURA HOMES',
      upiId: 'payments@aurahomes',
      upiPhone: '+91 98765 43210',
      qrCodeUrl: 'https://blob.example/qr-new.jpg',
    }
    expect(normalizePaymentSettings(raw)).toEqual(raw)
  })

  it('fills missing fields from the fallback so the page never renders blank', () => {
    const settings = normalizePaymentSettings({})
    expect(settings).toEqual(DEFAULT_PAYMENT_SETTINGS)
  })

  it('falls back to the static QR when the API returns an empty qrCodeUrl', () => {
    const settings = normalizePaymentSettings({
      upiName: 'R BALAKUMARAN',
      upiId: '9900662111@jupiteraxis',
      upiPhone: '+91 9900662111',
      qrCodeUrl: '',
    })
    expect(settings.qrCodeUrl).toBe(UPI_QR_FALLBACK_PATH)
  })

  it('trims values and ignores non-string garbage', () => {
    const settings = normalizePaymentSettings({
      upiName: '  AURA HOMES  ',
      upiId: 42,
      upiPhone: null,
      qrCodeUrl: '  https://blob.example/x.png  ',
    })
    expect(settings.upiName).toBe('AURA HOMES')
    expect(settings.upiId).toBe(DEFAULT_PAYMENT_SETTINGS.upiId)
    expect(settings.upiPhone).toBe(DEFAULT_PAYMENT_SETTINGS.upiPhone)
    expect(settings.qrCodeUrl).toBe('https://blob.example/x.png')
  })

  it('handles a null/undefined response', () => {
    expect(normalizePaymentSettings(null)).toEqual(DEFAULT_PAYMENT_SETTINGS)
    expect(normalizePaymentSettings(undefined)).toEqual(DEFAULT_PAYMENT_SETTINGS)
  })
})