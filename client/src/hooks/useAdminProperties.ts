import { useEffect, useState } from 'react'
import type { AdminProperty } from '@/types/admin'
import { AdminApiError, fetchAdminProperties } from '@/services/admin'

export interface AdminPropertiesState {
  properties: AdminProperty[]
  status: 'loading' | 'ready' | 'error'
  error: string | null
}

export function useAdminProperties(): AdminPropertiesState {
  const [state, setState] = useState<AdminPropertiesState>({
    properties: [],
    status: 'loading',
    error: null,
  })

  useEffect(() => {
    let active = true
    fetchAdminProperties()
      .then((items) => {
        if (active) setState({ properties: items, status: 'ready', error: null })
      })
      .catch((err) => {
        if (active) {
          setState({
            properties: [],
            status: 'error',
            error: err instanceof AdminApiError ? err.message : 'Failed to load properties.',
          })
        }
      })
    return () => {
      active = false
    }
  }, [])

  return state
}