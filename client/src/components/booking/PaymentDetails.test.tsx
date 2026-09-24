import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PaymentDetails } from '@/components/booking/PaymentDetails'
import { DEFAULT_PAYMENT_SETTINGS } from '@/lib/paymentSettingsFormat'

describe('PaymentDetails', () => {
  const settings = {
    upiName: 'AURA HOMES',
    upiId: 'payments@aurahomes',
    upiPhone: '+91 98765 43210',
    qrCodeUrl: 'https://blob.example/qr-dynamic.png',
  }

  it('renders the dynamic UPI id, payee name and phone from props', () => {
    const html = renderToStaticMarkup(<PaymentDetails settings={settings} />)

    expect(html).toContain('Pay via UPI')
    expect(html).toContain('AURA HOMES')
    expect(html).toContain('payments@aurahomes')
    expect(html).toContain('+91 98765 43210')
    expect(html).toContain('Save QR image')
    // No hard-coded payee values leak into the active UI.
    expect(html).not.toContain('R BALAKUMARAN')
    expect(html).not.toContain('9900662111@jupiteraxis')
  })

  it('renders the dynamic QR image from the settings qrCodeUrl', () => {
    const html = renderToStaticMarkup(<PaymentDetails settings={settings} />)

    expect(html).toContain('src="https://blob.example/qr-dynamic.png"')
    expect(html).toContain('Aura Homes UPI QR code')
  })

  it('renders the static fallback QR when the fallback path is active', () => {
    const html = renderToStaticMarkup(
      <PaymentDetails settings={{ ...DEFAULT_PAYMENT_SETTINGS }} />
    )

    expect(html).toContain('src="/qr.jpeg"')
    // Fallback values exactly match the shipped UPI details.
    expect(html).toContain('R BALAKUMARAN')
    expect(html).toContain('9900662111@jupiteraxis')
    expect(html).toContain('+91 9900662111')
  })
})