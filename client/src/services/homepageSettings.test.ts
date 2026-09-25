import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_HOMEPAGE_SETTINGS,
  fetchHomepageSettings,
  normalizeHomepageSettings,
} from '@/services/homepageSettings'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('homepage settings service', () => {
  it('loads a custom public visual and returns only the safe fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          visualImageUrl: 'https://blob.example/homepage/visual-custom.jpg',
          visualImageAlt: 'Rooftop terrace suite',
          id: 'single',
          createdAt: 'private',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    const settings = await fetchHomepageSettings()

    expect(fetchMock).toHaveBeenCalledWith('/api/homepage-settings')
    expect(settings).toEqual({
      visualImageUrl: 'https://blob.example/homepage/visual-custom.jpg',
      visualImageAlt: 'Rooftop terrace suite',
    })
  })

  it('keeps the existing fallback when no custom visual is configured', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            visualImageUrl: null,
            visualImageAlt: 'Aura Cozy Penthouse — interior',
          }),
          { status: 200 }
        )
      )
    )

    await expect(fetchHomepageSettings()).resolves.toEqual(DEFAULT_HOMEPAGE_SETTINGS)
  })

  it('falls back safely when the public endpoint fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network unavailable')))

    await expect(fetchHomepageSettings()).resolves.toEqual(DEFAULT_HOMEPAGE_SETTINGS)
  })

  it('rejects unusable image URLs and restores the default alt text', () => {
    expect(
      normalizeHomepageSettings({
        visualImageUrl: 'memory://homepage/visual.png',
        visualImageAlt: '   ',
      })
    ).toEqual(DEFAULT_HOMEPAGE_SETTINGS)
  })
})
