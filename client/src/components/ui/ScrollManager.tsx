import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useReducedMotion } from '@/hooks/useReducedMotion'

/**
 * Scrolls to the top on route change, or to the target element when the route
 * carries a hash (e.g. /properties/aura-cozy-penthouse-1#availability).
 */
export default function ScrollManager() {
  const location = useLocation()
  const reduced = useReducedMotion()

  useEffect(() => {
    const behavior: ScrollBehavior = reduced ? 'auto' : 'smooth'

    if (location.hash) {
      const target = document.querySelector(location.hash)
      if (target) {
        const scroll = () => target.scrollIntoView({ behavior, block: 'start' })
        const raf = requestAnimationFrame(() => scroll())
        const timer = window.setTimeout(scroll, 80)
        return () => {
          cancelAnimationFrame(raf)
          clearTimeout(timer)
        }
      }
    }

    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [location.pathname, location.hash, reduced])

  return null
}