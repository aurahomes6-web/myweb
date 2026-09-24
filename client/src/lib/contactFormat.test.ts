import { describe, expect, it } from 'vitest'
import { DEFAULT_CONTACT, mailtoHref, normalizeContact, telHref } from './contactFormat'

describe('contactFormat — footer contact mapping', () => {
  it('defaults match the footer values the site shipped with', () => {
    expect(DEFAULT_CONTACT).toEqual({
      email: 'stay@aurahomes.com',
      phone: '+91 00000 00000',
      description: 'Premium penthouse locations',
    })
  })

  it('normalizes the dynamic API payload for the footer', () => {
    const contact = normalizeContact({
      email: 'bookings@aurahomes.com',
      phone: '+91 98765 43210',
      description: 'Private rooftop stays in Bengaluru',
    })
    expect(contact).toEqual({
      email: 'bookings@aurahomes.com',
      phone: '+91 98765 43210',
      description: 'Private rooftop stays in Bengaluru',
    })
  })

  it('trims whitespace from every field', () => {
    const contact = normalizeContact({
      email: '  stay@aurahomes.com  ',
      phone: '  +91 00000 00000  ',
      description: '  Premium penthouse locations  ',
    })
    expect(contact.email).toBe('stay@aurahomes.com')
    expect(contact.phone).toBe('+91 00000 00000')
  })

  it('never renders undefined/null when the payload is malformed', () => {
    for (const raw of [null, undefined, 42, {}, { email: null, phone: undefined, description: '' }]) {
      const contact = normalizeContact(raw)
      expect(contact.email).toBe(DEFAULT_CONTACT.email)
      expect(contact.phone).toBe(DEFAULT_CONTACT.phone)
      expect(contact.description).toBe(DEFAULT_CONTACT.description)
    }
  })

  it('fills only the missing fields with defaults', () => {
    const contact = normalizeContact({ email: 'bookings@aurahomes.com' })
    expect(contact.email).toBe('bookings@aurahomes.com')
    expect(contact.phone).toBe(DEFAULT_CONTACT.phone)
    expect(contact.description).toBe(DEFAULT_CONTACT.description)
  })

  it('builds mailto hrefs from the saved email', () => {
    expect(mailtoHref('bookings@aurahomes.com')).toBe('mailto:bookings@aurahomes.com')
  })

  it('builds tel hrefs whose digits match the displayed phone', () => {
    expect(telHref('+91 98765 43210')).toBe('tel:+919876543210')
    expect(telHref('+91 00000 00000')).toBe('tel:+910000000000')
  })
})