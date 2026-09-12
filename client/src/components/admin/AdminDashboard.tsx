import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { fetchAdminMe } from '@/services/admin'
import { AdminLogin } from '@/components/admin/AdminLogin'
import { AdminShell } from '@/components/admin/AdminShell'

type AuthState = 'checking' | 'authed' | 'guest'

export default function AdminDashboard() {
  const [auth, setAuth] = useState<AuthState>('checking')

  useEffect(() => {
    let active = true
    fetchAdminMe()
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

  if (auth === 'guest') {
    return <AdminLogin onLoggedIn={handleLoggedIn} />
  }

  return <AdminShell onLoggedOut={handleLoggedOut} />
}