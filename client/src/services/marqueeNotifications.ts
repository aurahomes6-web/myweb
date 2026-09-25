import { useEffect, useState } from 'react'
import { API_BASE_URL } from '@/config/api'
import type { MarqueeNotification } from '@/types/marqueeNotifications'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function normalizeMarqueeNotifications(value: unknown): MarqueeNotification[] {
  if (!isRecord(value) || !Array.isArray(value.notifications)) {
    throw new Error('Invalid marquee notification response')
  }

  return value.notifications.map((notification) => {
    if (
      !isRecord(notification) ||
      typeof notification.id !== 'string' ||
      typeof notification.message !== 'string' ||
      notification.id.length === 0 ||
      notification.message.length === 0
    ) {
      throw new Error('Invalid marquee notification response')
    }
    return { id: notification.id, message: notification.message }
  })
}

export async function fetchMarqueeNotifications(): Promise<MarqueeNotification[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/marquee-notifications`, { cache: 'no-store' })
    if (!response.ok) return []
    return normalizeMarqueeNotifications(await response.json())
  } catch {
    return []
  }
}

export function useMarqueeNotifications(): MarqueeNotification[] {
  const [notifications, setNotifications] = useState<MarqueeNotification[]>([])

  useEffect(() => {
    let active = true
    fetchMarqueeNotifications().then((result) => {
      if (active) setNotifications(result)
    })
    return () => {
      active = false
    }
  }, [])

  return notifications
}
