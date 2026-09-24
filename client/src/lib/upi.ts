/**
 * Direct-UPI payment library for the AURA HOMES public site.
 *
 * The UPI details are intentionally static and public (they are printed on the
 * QR code), and UTR rules are mirrored from `server/src/lib/paymentValidation.ts`
 * so expectations fail fast client-side without trusting the client server-side.
 */

export const UPI_ID = '9900662111@jupiteraxis'

export const UPI_PHONE = '+91 9900662111'

export const UPI_ACCOUNT = 'R BALAKUMARAN'

/** Public QR asset served by the landing site. Never modify/recreate it. */
export const UPI_QR_PATH = '/qr.jpeg'

export const UPI_QR_DOWNLOAD_NAME = 'aura-homes-upi-qr.jpeg'

/** Mirrors the server's normalizeUtr: strip whitespace, then uppercase. */
export function normalizeUtr(value: string): string {
  return value.replace(/\s+/g, '').trim().toUpperCase()
}

/** Mirrors the server's isUtrReference: 12–22 alphanumeric characters. */
export function isValidUtr(value: string): boolean {
  return /^[A-Z0-9]{12,22}$/.test(normalizeUtr(value))
}

/**
 * Trigger a download of the QR code. Fetches the exact public asset so the
 * downloaded file always matches what is shown on screen.
 */
export async function downloadUpiQr(): Promise<void> {
  const response = await fetch(UPI_QR_PATH)
  if (!response.ok) throw new Error('QR could not be downloaded.')
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = UPI_QR_DOWNLOAD_NAME
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

/** Copy the UPI ID to the clipboard, falling back to textarea execCommand. */
export async function copyUpiId(): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(UPI_ID)
      return true
    }
  } catch {
    // Fall through to the legacy path (also used on insecure contexts).
  }
  try {
    const textarea = document.createElement('textarea')
    textarea.value = UPI_ID
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    const ok = document.execCommand('copy')
    textarea.remove()
    return ok
  } catch {
    return false
  }
}