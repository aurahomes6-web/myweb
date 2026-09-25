import { useEffect, useState } from 'react'
import { API_BASE_URL, resolveImageUrl } from '@/config/api'
import type { HomepageSettingsInfo } from '@/types'

export const DEFAULT_HOMEPAGE_SETTINGS: HomepageSettingsInfo = Object.freeze({
  visualImageUrl: null,
  visualImageAlt: 'Aura Cozy Penthouse — interior',
})

export function normalizeHomepageSettings(value: unknown): HomepageSettingsInfo {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Invalid homepage settings response')
  }

  const body = value as Record<string, unknown>
  const visualImageUrl =
    typeof body.visualImageUrl === 'string' ? resolveImageUrl(body.visualImageUrl) : null
  const visualImageAlt =
    typeof body.visualImageAlt === 'string' && body.visualImageAlt.trim().length > 0
      ? body.visualImageAlt.trim()
      : DEFAULT_HOMEPAGE_SETTINGS.visualImageAlt

  return { visualImageUrl, visualImageAlt }
}

export async function fetchHomepageSettings(): Promise<HomepageSettingsInfo> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/homepage-settings`)
    if (!response.ok) throw new Error(`Homepage settings API returned ${response.status}`)
    return normalizeHomepageSettings(await response.json())
  } catch {
    return DEFAULT_HOMEPAGE_SETTINGS
  }
}

export interface HomepageSettingsState {
  settings: HomepageSettingsInfo
  status: 'loading' | 'ready'
}

export function useHomepageSettings(): HomepageSettingsState {
  const [state, setState] = useState<HomepageSettingsState>({
    settings: DEFAULT_HOMEPAGE_SETTINGS,
    status: 'loading',
  })

  useEffect(() => {
    let active = true
    fetchHomepageSettings().then((settings) => {
      if (active) setState({ settings, status: 'ready' })
    })
    return () => {
      active = false
    }
  }, [])

  return state
}
