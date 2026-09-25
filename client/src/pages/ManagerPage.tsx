import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { ManagerLogin } from '@/components/manager/ManagerLogin'
import { ManagerApp } from '@/components/manager/ManagerApp'
import { fetchManagerMe } from '@/services/manager'

type AuthState = 'checking' | 'authed' | 'guest'

/**
 * /manager — the hidden manager panel.
 *
 * Rendered OUTSIDE the public AppShell (no site navbar, footer or transitions)
 * and deliberately unlinked: no public page, navbar, footer or admin navigation
 * item points here. The manager reaches it by typing the path directly.
 *
 * Hiding the link is not the security boundary — `requireManager` on every
 * /api/manager route is. This component only decides what to render once the
 * backend has already answered.
 */
export default function ManagerPage() {
  const [auth, setAuth] = useState<AuthState>('checking')

  useEffect(() => {
    let active = true
    fetchManagerMe()
      .then(() => {
        if (active) setAuth('authed')
      })
      .catch(() => {
        if (active) setAuth('guest')
      })
    return () => {
      active = false
    }
  }, [])

  const handleLoggedIn = useCallback(() => setAuth('authed'), [])
  const handleLoggedOut = useCallback(() => setAuth('guest'), [])

  if (auth === 'checking') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <Loader2 size={28} className="animate-spin text-purple-bright" />
      </div>
    )
  }

  if (auth === 'guest') return <ManagerLogin onLoggedIn={handleLoggedIn} />

  return <ManagerApp onLoggedOut={handleLoggedOut} />
}
