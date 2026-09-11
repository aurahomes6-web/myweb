import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { checkAvailability } from '@/services/availability'
import type {
  AvailabilityCheckRequest,
  AvailabilityResult,
  AvailabilityStatus,
  PropertySlug,
} from '@/types'
import { isValidRange } from '@/lib/date'

/**
 * Read-only access to the shared booking URL params
 * (?property=&checkIn=&checkOut=&guests=). The writes go through the specific
 * components' own `useSearchParams` so updates stay local to the flow. OK.
 */
export function useReservationQuery() {
  const [searchParams] = useSearchParams()
  return {
    property: searchParams.get('property'),
    checkIn: searchParams.get('checkIn') ?? '',
    checkOut: searchParams.get('checkOut') ?? '',
    guestsParam: searchParams.get('guests'),
  }
}

interface UseAvailabilityOptions {
  checkIn: string
  checkOut: string
  guests: number
  propertyId?: PropertySlug
}

interface Settled {
  request: AvailabilityCheckRequest
  status: Extract<AvailabilityStatus, 'available' | 'unavailable' | 'error'>
  result: AvailabilityResult | null
}

/**
 * Runs an availability check for the current selection and derives the UI
 * status. The `loading` phase is derived during render from the absence of a
 * settled result for the current selection, so no synchronous state updates are
 * required when the inputs change.
 */
export function useAvailability({ checkIn, checkOut, guests, propertyId }: UseAvailabilityOptions) {
  const [settled, setSettled] = useState<Settled | null>(null)
  const [nonce, setNonce] = useState(0)

  const runnable = Boolean(propertyId && isValidRange(checkIn, checkOut))

  useEffect(() => {
    if (!runnable || !propertyId) return

    let cancelled = false
    const request: AvailabilityCheckRequest = { propertyId, checkIn, checkOut, guests }

    checkAvailability(request)
      .then((res) => {
        if (cancelled) return
        setSettled({ request, status: res.available ? 'available' : 'unavailable', result: res })
      })
      .catch(() => {
        if (cancelled) return
        setSettled({ request, status: 'error', result: null })
      })

    return () => {
      cancelled = true
    }
  }, [runnable, propertyId, checkIn, checkOut, guests, nonce])

  const retry = useCallback(() => setNonce((n) => n + 1), [])

  const matchesSelection = (s: Settled | null) =>
    s !== null &&
    s.request.propertyId === propertyId &&
    s.request.checkIn === checkIn &&
    s.request.checkOut === checkOut &&
    s.request.guests === guests

  const settledForSelection = matchesSelection(settled) ? settled : null

  let status: AvailabilityStatus = 'idle'
  if (runnable && !settledForSelection) status = 'loading'
  else if (settledForSelection) status = settledForSelection.status

  return { status, result: settledForSelection?.result ?? null, retry }
}