/**
 * Lightweight phone masking for display-only hints in the admin forms.
 * Fallbacks safely for short / partial inputs.
 */
export function maskPhoneHint(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length <= 2) return ''
  return `SMS & booking confirmations use ${trimmed.slice(0, 2)}••••${trimmed.slice(-2)}`
}