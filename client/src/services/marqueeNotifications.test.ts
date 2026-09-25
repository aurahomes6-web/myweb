import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchMarqueeNotifications,
  normalizeMarqueeNotifications,
} from '@/services/marqueeNotifications'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('marquee notification service', () => {
  it('loads the safe public notification shape', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          notifications: [
            { id: 'welcome', message: 'Welcome to AURA HOMES' },
            { id: 'offer', message: 'Plan your next escape', isActive: true },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    const notifications = await fetchMarqueeNotifications()

    expect(fetchMock).toHaveBeenCalledWith('/api/marquee-notifications', { cache: 'no-store' })
    expect(notifications).toEqual([
      { id: 'welcome', message: 'Welcome to AURA HOMES' },
      { id: 'offer', message: 'Plan your next escape' },
    ])
  })

  it('fails closed when the endpoint is unavailable or malformed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network unavailable')))
    await expect(fetchMarqueeNotifications()).resolves.toEqual([])

    expect(() =>
      normalizeMarqueeNotifications({ notifications: [{ id: 'missing-message' }] })
    ).toThrow()
  })
})
