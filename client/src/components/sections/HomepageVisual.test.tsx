import { fireEvent, render, waitFor } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { HomepageVisual } from '@/components/sections/HomepageVisual'

const FALLBACK_HTML_FINGERPRINT = '22ef48b0'

function fingerprint(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

describe('HomepageVisual', () => {
  it('renders a custom visual with its configured alt text', () => {
    const html = renderToStaticMarkup(
      <HomepageVisual
        imageUrl="https://blob.example/homepage/visual-custom.jpg"
        imageAlt="Rooftop terrace suite"
      />
    )

    expect(html).toContain('src="https://blob.example/homepage/visual-custom.jpg"')
    expect(html).toContain('alt="Rooftop terrace suite"')
    expect(html).not.toContain('<svg')
  })

  it('renders the exact existing MoonScene fallback when no custom visual exists', () => {
    const actual = renderToStaticMarkup(
      <HomepageVisual imageUrl={null} imageAlt="Aura Cozy Penthouse — interior" />
    )

    expect(fingerprint(actual)).toBe(FALLBACK_HTML_FINGERPRINT)
    expect(actual).toContain('<svg')
    expect(actual).toContain('viewBox="0 0 800 600"')
  })

  it('returns to the built-in artwork if a custom image fails to load', async () => {
    const { container } = render(
      <HomepageVisual
        imageUrl="https://blob.example/homepage/visual-broken.jpg"
        imageAlt="Rooftop terrace suite"
      />
    )
    const image = container.querySelector('img')
    expect(image).not.toBeNull()

    fireEvent.error(image as HTMLImageElement)

    await waitFor(() => {
      expect(container.querySelector('svg')).not.toBeNull()
      expect(container.querySelector('img')).toBeNull()
    })
  })
})
