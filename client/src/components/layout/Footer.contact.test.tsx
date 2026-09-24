import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import Footer from './Footer'
import { DEFAULT_CONTACT } from '@/lib/contactFormat'

describe('Footer contact section', () => {
  it('renders the contact data with clickable mailto and tel links', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>
    )

    // Email → mailto: link.
    expect(html).toContain(DEFAULT_CONTACT.email)
    expect(html).toContain(`mailto:${DEFAULT_CONTACT.email}`)

    // Phone → tel: link whose digits match the display string.
    expect(html).toContain(DEFAULT_CONTACT.phone)
    expect(html).toContain(`tel:+${DEFAULT_CONTACT.phone.replace(/\D/g, '')}`)

    // Descriptive tagline rendered as text.
    expect(html).toContain(DEFAULT_CONTACT.description)

    // The column heading and footer chrome still render.
    expect(html).toContain('Contact')
    expect(html).toContain('AURA HOMES. All rights reserved.')
  })
})