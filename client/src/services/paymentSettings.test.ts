import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchPaymentSettings } from '@/services/paymentSettings'
import { DEFAULT_PAYMENT_SETTINGS, UPI_QR_FALLBACK_PATH } from '@/lib/paymentSettingsFormat'

describe('paymentSettings service — fetchPaymentSettings', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('returns the admin-editable values from GET /api/payment-settings', async () => {
    const apiValue = {
      upiName: 'AURA HOMES',
      upiId: 'payments@aurahomes',
      upiPhone: '+91 98765 43210',
      qrCodeUrl: 'https://blob.example/qr-new.jpg',
    }
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => apiValue })
    vi.stubGlobal('fetch', fetchMock)

    const settings = await fetchPaymentSettings()

    expect(fetchMock).toHaveBeenCalledWith('/api/payment-settings')
    expect(settings).toEqual(apiValue)
  })

  it('resolves an empty qrCodeUrl from the API to the static fallback', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        upiName: 'R BALAKUMARAN',
        upiId: '9900662111@jupiteraxis',
        upiPhone: '+91 9900662111',
        qrCodeUrl: '',
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const settings = await fetchPaymentSettings()
    expect(settings.qrCodeUrl).toBe(UPI_QR_FALLBACK_PATH)
  })

  it('falls back to the site defaults when the API is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))

    const settings = await fetchPaymentSettings()
    expect(settings).toEqual(DEFAULT_PAYMENT_SETTINGS)
  })

  it('falls back to the site defaults when the API returns an error status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))

    const settings = await fetchPaymentSettings()
    expect(settings).toEqual(DEFAULT_PAYMENT_SETTINGS)
  })

  it('falls back to the site defaults when the API returns malformed JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => null }))

    const settings = await fetchPaymentSettings()
    expect(settings).toEqual(DEFAULT_PAYMENT_SETTINGS)
  })
})