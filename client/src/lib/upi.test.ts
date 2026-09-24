import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyUpiId, downloadUpiQr, isValidUtr, normalizeUtr } from './upi'
import { UPI_QR_DOWNLOAD_NAME } from './paymentSettingsFormat'

describe('upi — normalizeUtr', () => {
  it('strips internal whitespace', () => {
    expect(normalizeUtr(' 4082 1691 8253 ')).toBe('408216918253')
  })

  it('uppercases the input', () => {
    expect(normalizeUtr('nbci408216918253')).toBe('NBCI408216918253')
  })

  it('returns an empty string for whitespace-only input', () => {
    expect(normalizeUtr('   ')).toBe('')
  })
})

describe('upi — isValidUtr', () => {
  it('accepts a real-world 12-character RRN-style UTR', () => {
    expect(isValidUtr('408216918253')).toBe(true)
  })

  it('accepts a 22-character alphanumeric UTR', () => {
    expect(isValidUtr('NBCI408216918253ABCDEF')).toBe(true)
  })

  it('accepts mixed-case and whitespace-separated input', () => {
    expect(isValidUtr(' 4082 1691 8253 ')).toBe(true)
    expect(isValidUtr('nbci408216918253')).toBe(true)
  })

  it('rejects strings shorter than 12 characters', () => {
    expect(isValidUtr('40821691825')).toBe(false)
  })

  it('rejects strings longer than 22 characters', () => {
    expect(isValidUtr('NBCI408216918253ABCDEFGHXYZ')).toBe(false)
  })

  it('rejects non-alphanumeric characters', () => {
    expect(isValidUtr('40821691825-')).toBe(false)
    expect(isValidUtr('4082 1691 8253!')).toBe(false)
  })

  it('rejects empty and whitespace-only input', () => {
    expect(isValidUtr('')).toBe(false)
    expect(isValidUtr('   ')).toBe(false)
  })
})

describe('upi — downloadUpiQr', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('downloads the active (Blob) QR URL with the expected file name', async () => {
    const blob = new Blob(['fake-image'], { type: 'image/jpeg' })
    const objectUrl = 'blob:mock-qr'
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: async () => blob })
    vi.stubGlobal('fetch', fetchMock)

    const createObjectURL = vi.fn().mockReturnValue(objectUrl)
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })

    const clickMock = vi.fn()
    const removeMock = vi.fn()
    const anchor: Record<string, unknown> = {
      href: '',
      download: '',
      click: clickMock,
      remove: removeMock,
    }
    vi.stubGlobal('document', {
      createElement: () => anchor,
      body: { appendChild: () => anchor },
    })

    await downloadUpiQr('https://blob.example/qr-1.jpg')

    expect(fetchMock).toHaveBeenCalledWith('https://blob.example/qr-1.jpg')
    expect(anchor.href).toBe(objectUrl)
    expect(anchor.download).toBe(UPI_QR_DOWNLOAD_NAME)
    expect(clickMock).toHaveBeenCalledTimes(1)
    expect(removeMock).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith(objectUrl)
  })

  it('downloads the static fallback asset when no Blob QR is set', async () => {
    const blob = new Blob(['fake-image'], { type: 'image/jpeg' })
    const objectUrl = 'blob:mock-qr'
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: async () => blob })
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('URL', { createObjectURL: () => objectUrl, revokeObjectURL: vi.fn() })
    vi.stubGlobal('document', {
      createElement: () => ({ href: '', download: '', click: () => {}, remove: () => {} }),
      body: { appendChild: () => undefined },
    })

    await downloadUpiQr('/qr.jpeg')

    expect(fetchMock).toHaveBeenCalledWith('/qr.jpeg')
  })

  it('throws when the QR asset cannot be fetched', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404 })
    vi.stubGlobal('fetch', fetchMock)

    await expect(downloadUpiQr('https://blob.example/missing.jpg')).rejects.toThrow(
      'QR could not be downloaded.'
    )
  })
})

describe('upi — copyUpiId', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('uses the async clipboard API on a secure context', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    vi.stubGlobal('window', { isSecureContext: true })

    await expect(copyUpiId('9900662111@jupiteraxis')).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith('9900662111@jupiteraxis')
  })

  it('falls back to the execCommand textarea path when the navigator API is unavailable', async () => {
    const execCommand = vi.fn().mockReturnValue(true)
    const textarea = {
      value: '',
      style: {},
      focus: vi.fn(),
      select: vi.fn(),
      remove: vi.fn(),
    }
    vi.stubGlobal('navigator', {}) // no clipboard member at all
    vi.stubGlobal('document', {
      createElement: () => textarea,
      body: { appendChild: () => textarea },
      execCommand,
    })

    await expect(copyUpiId('my-handle@mybank')).resolves.toBe(true)
    expect(execCommand).toHaveBeenCalledWith('copy')
    expect(textarea.value).toBe('my-handle@mybank')
  })

  it('reports failure when neither path can copy', async () => {
    vi.stubGlobal('navigator', {})
    vi.stubGlobal('document', {
      createElement: () => ({ value: '', style: {}, focus: () => {}, select: () => {}, remove: () => {} }),
      body: { appendChild: () => undefined },
      execCommand: () => {
        throw new Error('copy blocked')
      },
    })

    await expect(copyUpiId('my-handle@mybank')).resolves.toBe(false)
  })
})