/**
 * Direct-UPI payment helpers for the AURA HOMES public site.
 *
 * The current UPI details come from the payment settings API (admin-editable),
 * so these helpers receive the active values as arguments instead of importing
 * hard-coded constants. UTR rules are mirrored from
 * `server/src/lib/paymentValidation.ts` so expectations fail fast client-side
 * without trusting the client server-side.
 */

import { UPI_QR_DOWNLOAD_NAME } from '@/lib/paymentSettingsFormat'

/** Mirrors the server's normalizeUtr: strip whitespace, then uppercase. */
export function normalizeUtr(value: string): string {
  return value.replace(/\s+/g, '').trim().toUpperCase()
}

/** Mirrors the server's isUtrReference: 12–22 alphanumeric characters. */
export function isValidUtr(value: string): boolean {
  return /^[A-Z0-9]{12,22}$/.test(normalizeUtr(value))
}

/**
 * Trigger a download of the active QR. Fetches the exact public asset in use
 * (the Blob URL returned by the API, or the static `/qr.jpeg` fallback while it
 * is still active) so the downloaded file always matches what is on screen.
 */
export async function downloadUpiQr(qrUrl: string): Promise<void> {
  const response = await fetch(qrUrl)
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

/** Copy the given UPI ID to the clipboard, falling back to textarea execCommand. */
export async function copyUpiId(upiId: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(upiId)
      return true
    }
  } catch {
    // Fall through to the legacy path (also used on insecure contexts).
  }
  try {
    const textarea = document.createElement('textarea')
    textarea.value = upiId
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