import { useEffect, useRef, useState } from 'react'
import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { LogOut, Menu, X } from 'lucide-react'
import Button from '@/components/ui/Button'
import { BookingsTab } from '@/components/admin/BookingsTab'
import { AirbnbTab } from '@/components/admin/AirbnbTab'
import { PropertiesTab } from '@/components/admin/PropertiesTab'
import { HomepageSettingsTab } from '@/components/admin/HomepageSettingsTab'
import { MarqueeNotificationsTab } from '@/components/admin/MarqueeNotificationsTab'
import { CouponsTab } from '@/components/admin/CouponsTab'
import { ContactTab } from '@/components/admin/ContactTab'
import { CleanupTab } from '@/components/admin/CleanupTab'
import { BlockDatesTab } from '@/components/admin/BlockDatesTab'
import { DetailsTab } from '@/components/admin/DetailsTab'
import { ManagerTab } from '@/components/admin/ManagerTab'
import { PaymentsTab } from '@/components/admin/PaymentsTab'
import { PaymentSettingsTab } from '@/components/admin/PaymentSettingsTab'
import { adminLogout } from '@/services/admin'
import { cn } from '@/lib/cn'

// Order is intentional and stable. `Manager` configures the manager checklist;
// it is NOT a link to the manager panel, which stays unlinked everywhere.
const tabs = [
  { to: '/admin', label: 'Bookings', end: true },
  { to: '/admin/payments', label: 'Payments', end: false },
  { to: '/admin/payment-settings', label: 'Payment Settings', end: false },
  { to: '/admin/airbnb', label: 'Airbnb', end: false },
  { to: '/admin/properties', label: 'Properties', end: false },
  { to: '/admin/homepage', label: 'Homepage', end: false },
  { to: '/admin/marquee-notifications', label: 'Marquee', end: false },
  { to: '/admin/coupons', label: 'Coupons', end: false },
  { to: '/admin/contact', label: 'Contact', end: false },
  { to: '/admin/cleanup', label: 'Cleanup', end: false },
  { to: '/admin/block-dates', label: 'Block Dates', end: false },
  { to: '/admin/details', label: 'Details', end: false },
  { to: '/admin/manager', label: 'Manager', end: false },
]

interface AdminShellProps {
  onLoggedOut: () => void
}

export function AdminShell({ onLoggedOut }: AdminShellProps) {
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const mobileDialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!mobileMenuOpen) return

    const previouslyFocused = menuButtonRef.current
    const previousOverflow = document.body.style.overflow
    const focusFrame = window.requestAnimationFrame(() => {
      mobileDialogRef.current?.querySelector<HTMLButtonElement>('[data-admin-menu-close]')?.focus()
    })
    document.body.style.overflow = 'hidden'

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        setMobileMenuOpen(false)
      }
    }

    function keepFocusInMenu(event: KeyboardEvent) {
      if (event.key !== 'Tab' || !mobileDialogRef.current) return
      const focusable = Array.from(
        mobileDialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      )
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', closeOnEscape)
    document.addEventListener('keydown', keepFocusInMenu)

    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.removeEventListener('keydown', closeOnEscape)
      document.removeEventListener('keydown', keepFocusInMenu)
      document.body.style.overflow = previousOverflow
      previouslyFocused?.focus()
    }
  }, [mobileMenuOpen])

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
        <div className="mx-auto flex h-16 max-w-[100rem] items-center justify-between gap-4 px-5 sm:px-8">
          <div className="flex shrink-0 items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl">
              <img src="/logo.jpeg" alt="AURA HOMES" className="h-9 w-9 object-cover" />
            </div>
            <div>
              <p className="font-display text-sm font-bold leading-none tracking-tight text-text-primary">AURA HOMES</p>
              <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.24em] text-text-muted">Admin</p>
            </div>
          </div>

          <nav
            className="hidden min-w-0 flex-1 items-center justify-end gap-0.5 py-1 min-[1500px]:flex"
            aria-label="Admin sections"
          >
            {tabs.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.end}
                aria-current={location.pathname === tab.to ? 'page' : undefined}
                className={({ isActive }) =>
                  cn(
                    'shrink-0 rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] transition-colors',
                    isActive
                      ? 'bg-gradient-to-r from-purple/25 to-cyan/25 text-text-primary ring-1 ring-purple/30'
                      : 'text-text-muted hover:text-text-primary'
                  )
                }
              >
                {tab.label}
              </NavLink>
            ))}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void handleLogout()}
              className="ml-1 shrink-0 px-3"
              aria-label="Sign out"
            >
              <LogOut size={14} />
              <span>Sign out</span>
            </Button>
          </nav>

          <button
            ref={menuButtonRef}
            type="button"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-text-primary transition-colors hover:bg-surface-100/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-bright min-[1500px]:hidden"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open admin menu"
            aria-expanded={mobileMenuOpen}
            aria-controls="admin-mobile-menu"
          >
            <Menu size={21} aria-hidden="true" />
          </button>
        </div>
      </header>

      {mobileMenuOpen ? (
        <div
          ref={mobileDialogRef}
          id="admin-mobile-menu"
          className="fixed inset-0 z-50 flex flex-col bg-surface/95 backdrop-blur-xl min-[1500px]:hidden"
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-mobile-menu-title"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) setMobileMenuOpen(false)
          }}
        >
          <div className="flex h-16 shrink-0 items-center justify-between border-b border-surface-300/40 px-5 sm:px-8">
            <div>
              <p className="font-display text-sm font-bold text-text-primary">AURA HOMES</p>
              <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.24em] text-text-muted">Admin</p>
            </div>
            <button
              data-admin-menu-close
              type="button"
              className="grid h-10 w-10 place-items-center rounded-full text-text-primary transition-colors hover:bg-surface-100/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-bright"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Close admin menu"
            >
              <X size={21} aria-hidden="true" />
            </button>
          </div>

          <nav
            className="flex flex-1 flex-col gap-1 overflow-y-auto px-5 py-6 sm:px-8"
            aria-label="Admin sections"
          >
            <h1 id="admin-mobile-menu-title" className="sr-only">
              Admin navigation
            </h1>
            {tabs.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.end}
                aria-current={location.pathname === tab.to ? 'page' : undefined}
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  cn(
                    'rounded-2xl px-4 py-3.5 text-sm font-semibold uppercase tracking-[0.14em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-bright',
                    isActive
                      ? 'bg-gradient-to-r from-purple/25 to-cyan/25 text-text-primary ring-1 ring-purple/30'
                      : 'text-text-muted hover:bg-surface-100/50 hover:text-text-primary'
                  )
                }
              >
                {tab.label}
              </NavLink>
            ))}
            <Button
              variant="ghost"
              onClick={() => {
                setMobileMenuOpen(false)
                void handleLogout()
              }}
              className="mt-4 w-full justify-start"
              aria-label="Sign out"
            >
              <LogOut size={16} />
              Sign out
            </Button>
          </nav>
        </div>
      ) : null}

      <main className="mx-auto max-w-7xl px-5 py-10 sm:px-8">
        <Routes>
          <Route index element={<BookingsTab />} />
          <Route path="bookings" element={<BookingsTab />} />
          <Route path="payments" element={<PaymentsTab />} />
          <Route path="payment-settings" element={<PaymentSettingsTab />} />
          <Route path="airbnb" element={<AirbnbTab />} />
          <Route path="properties" element={<PropertiesTab />} />
          <Route path="block-dates" element={<BlockDatesTab />} />
          <Route path="details" element={<DetailsTab />} />
          <Route path="manager" element={<ManagerTab />} />
          <Route path="homepage" element={<HomepageSettingsTab />} />
          <Route path="marquee-notifications" element={<MarqueeNotificationsTab />} />
          <Route path="coupons" element={<CouponsTab />} />
          <Route path="contact" element={<ContactTab />} />
          <Route path="cleanup" element={<CleanupTab />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </main>
    </div>
  )
}