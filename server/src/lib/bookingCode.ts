const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // excludes I, O, 0, 1
const CODE_LENGTH = 10

export const BOOKING_CODE_PREFIX = 'AURA'
export const BOOKING_CODE_RE = /^AURA[A-Z2-9]{10}$/

export function generateBookingCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH)
  crypto.getRandomValues(bytes)
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[bytes[i] % ALPHABET.length]
  }
  return `${BOOKING_CODE_PREFIX}${code}`
}