import { Navigate, NavLink, Route, Routes } from 'react-router-dom'
import { Building2, LogOut } from 'lucide-react'
import Button from '@/components/ui/Button'
import { BookingsTab } from '@/components/admin/BookingsTab'
import { AirbnbTab } from '@/components/admin/AirbnbTab'
import { PropertiesTab } from '@/components/admin/PropertiesTab'
import { CleanupTab } from '@/components/admin/CleanupTab'
import { adminLogout } from '@/services/admin'
import { cn } from '@/lib/cn'

const tabs = [
  { to: '/admin', label: 'Bookings', end: true },
  { to: '/admin/airbnb', label: 'Airbnb', end: false },
  { to: '/admin/properties', label: 'Properties', end: false },
  { to: '/admin/cleanup', label: 'Cleanup', end: false },
]

interface AdminShellProps {
  onLoggedOut: () => void
}

export function AdminShell({ onLoggedOut }: AdminShellProps) {
  async function handleLogout() {
    try {
      await adminLogout()
    } catch {
      // Local session reset below is enough even if the network call fails.
    }
    onLoggedOut()
  }

  return (
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 z-30 border-b border-surface-300/40 bg-surface/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-5 sm:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-purple to-cyan">
              <Building2 size={17} className="text-white" />
            </div>
            <div>
              <p className="font-display text-sm font-bold leading-none tracking-tight text-text-primary">AURA HOMES</p>
              <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.24em] text-text-muted">Admin</p>
            </div>
          </div>

          <nav className="flex items-center gap-1 sm:gap-2">
            {tabs.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  cn(
                    'rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition-colors',
                    isActive
                      ? 'bg-gradient-to-r from-purple/25 to-cyan/25 text-text-primary ring-1 ring-purple/30'
                      : 'text-text-muted hover:text-text-primary'
                  )
                }
              >
                {tab.label}
              </NavLink>
            ))}
            <Button variant="ghost" size="sm" onClick={handleLogout} className="ml-1">
              <LogOut size={14} />
              Sign out
            </Button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-5 py-10 sm:px-8">
        <Routes>
          <Route index element={<BookingsTab />} />
          <Route path="bookings" element={<BookingsTab />} />
          <Route path="airbnb" element={<AirbnbTab />} />
          <Route path="properties" element={<PropertiesTab />} />
          <Route path="cleanup" element={<CleanupTab />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </main>
    </div>
  )
}