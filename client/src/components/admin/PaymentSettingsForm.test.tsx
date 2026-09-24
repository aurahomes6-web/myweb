import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PaymentSettingsForm } from '@/components/admin/PaymentSettingsForm'

function renderForm(overrides: Partial<Parameters<typeof PaymentSettingsForm>[0]> = {}) {
  const formProps = {
    upiName: 'R BALAKUMARAN',
    upiId: '9900662111@jupiteraxis',
    upiPhone: '+91 9900662111',
    onUpiNameChange: () => undefined,
    onUpiIdChange: () => undefined,
    onUpiPhoneChange: () => undefined,
    dirty: false,
    saving: false,
    saved: false,
    saveError: null,
    saveDetails: undefined,
    onSave: () => undefined,
    currentQrUrl: 'https://blob.example/qr-live.jpg',
    qrSource: 'blob',
    qrPreviewUrl: null,
    qrUploading: false,
    qrError: null,
    onSelectQrFile: () => undefined,
    onUploadQr: () => undefined,
    ...overrides,
  } as Parameters<typeof PaymentSettingsForm>[0]
  return renderToStaticMarkup(<PaymentSettingsForm {...formProps} />)
}

describe('PaymentSettingsForm', () => {
  it('renders the UPI details form fields with the current values', () => {
    const html = renderForm()

    expect(html).toContain('UPI Name')
    expect(html).toContain('UPI ID')
    expect(html).toContain('UPI Phone')
    expect(html).toContain('value="R BALAKUMARAN"')
    expect(html).toContain('value="9900662111@jupiteraxis"')
    expect(html).toContain('value="+91 9900662111"')
    expect(html).toContain('Save changes')
  })

  it('shows the default loading hints when nothing has changed', () => {
    const html = renderForm({ dirty: false })
    expect(html).toContain('No changes yet.')
  })

  it('shows the saving state and the saved confirmation', () => {
    const savingHtml = renderForm({ saving: true, dirty: true })
    expect(savingHtml).toContain('Saving…')
    expect(savingHtml).not.toContain('Save changes')

    const savedHtml = renderForm({ saved: true })
    expect(savedHtml).toContain('UPI details saved.')
  })

  it('shows validation errors returned by the server', () => {
    const html = renderForm({
      saveError: 'Please review the highlighted fields.',
      saveDetails: [{ field: 'upiId', message: 'Enter a valid UPI ID (handle@provider).' }],
    })
    expect(html).toContain('Please review the highlighted fields.')
    expect(html).toContain('upiId: ')
    expect(html).toContain('Enter a valid UPI ID (handle@provider).')
  })

  it('renders the current QR preview and the upload controls', () => {
    const html = renderForm()

    expect(html).toContain('QR code')
    expect(html).toContain('src="https://blob.example/qr-live.jpg"')
    expect(html).toContain('Choose a QR image')
    expect(html).toContain('type="file"')
    expect(html).toContain('Upload QR')
  })

  it('previews the newly selected image before it is uploaded', () => {
    const html = renderForm({ qrPreviewUrl: 'blob:file-preview-1' })

    expect(html).toContain('src="blob:file-preview-1"')
    expect(html).toContain('New QR selected')
    expect(html).not.toContain('src="https://blob.example/qr-live.jpg"')
  })

  it('shows the upload loading state', () => {
    const html = renderForm({ qrUploading: true })
    expect(html).toContain('Uploading…')
  })

  it('shows QR upload errors', () => {
    const html = renderForm({ qrError: 'The QR image could not be uploaded. Please try again.' })
    expect(html).toContain('The QR image could not be uploaded. Please try again.')
  })

  it('warns about the fallback QR while none is stored yet', () => {
    const html = renderForm({ qrSource: 'fallback', currentQrUrl: '/qr.jpeg' })
    expect(html).toContain('built-in fallback QR')
  })

  it('confirms a stored Blob QR is live and shows the object reference', () => {
    const html = renderForm({ qrSource: 'blob', currentQrUrl: 'https://blob.example/qr-1.jpg' })
    expect(html).toContain('The stored QR is live on the payment page now.')
    expect(html).toContain('https://blob.example/qr-1.jpg')
  })
})