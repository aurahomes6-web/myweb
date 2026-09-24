import type { ContactInfo } from '@/types'

/**
 * Pure helpers that turn the backend's contact configuration into the values
 * the public footer renders. Kept free of Vite/env imports so the mapping is
 * unit-testable in isolation.
 */

/** Current footer values, used until the API answers (mirrors loadProperties's fallback pattern). */
export const DEFAULT_CONTACT: ContactInfo = Object.freeze({
  email: 'stay@aurahomes.com',
  phone: '+91 00000 00000',
  description: 'Premium penthouse locations',
})

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback
}

/**
 * Validate/clean the public API response so the footer never renders
 * `undefined`/`null` if the payload is malformed or a field is missing.
 */
export function normalizeContact(raw: unknown): ContactInfo {
  const record: Record<string, unknown> =
    typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  return {
    email: text(record.email, DEFAULT_CONTACT.email),
    phone: text(record.phone, DEFAULT_CONTACT.phone),
    description: text(record.description, DEFAULT_CONTACT.description),
  }
}

export function mailtoHref(email: string): string {
  return `mailto:${email}`
}

/** Build a `tel:` href whose digits always match the displayed phone number. */
export function telHref(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return `tel:+${digits}`
}