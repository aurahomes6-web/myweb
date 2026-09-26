import { useEffect, useId, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { ChevronDown, LogOut } from 'lucide-react'
import Button from '@/components/ui/Button'
import { cn } from '@/lib/cn'

/**
 * Desktop overflow menu for the admin header.
 *
 * The header used to lay out all thirteen sections in one row, which squeezed
 * and overlapped on narrower desktops. Only four primary sections are shown
 * inline now; the rest live behind this disclosure. Nothing was removed — the
 * mobile drawer still lists every section, and the routes are unchanged.
 *
 * Behaviour is a plain disclosure pattern (button + panel) rather than an ARIA
 * `menu`, because the contents are site navigation: the panel is just a set of
 * links, so they stay links and remain reachable with Tab.
 *
 * `Manager` here only configures the checklist. The manager panel at /manager is
 * reached by typing the path and is never linked from the admin.
 */

export interface AdminMoreMenuItem {
  to: string
  label: string
  end: boolean
}

interface AdminMoreMenuProps {
  items: AdminMoreMenuItem[]
  onSignOut: () => void
}

const FOCUSABLE = 'a[href], button:not([disabled])'

export function AdminMoreMenu({ items, onSignOut }: AdminMoreMenuProps) {
  const location = useLocation()
  // Derived instead of a stored boolean: the menu can only be open on the route
  // it was opened from, so any navigation — from this panel, from a primary
  // link, from the back button — dismisses it with no reset effect needed.
  const [openedOnPath, setOpenedOnPath] = useState<string | null>(null)
  const open = openedOnPath === location.pathname
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const panelId = useId()

  // A More-section is "active" when the current route is one of them, so the
  // trigger can show the same treatment an inline link would.
  const activeItem = items.find((item) => location.pathname === item.to) ?? null

  function close() {
    setOpenedOnPath(null)
  }

  function toggle() {
    setOpenedOnPath((current) => (current === location.pathname ? null : location.pathname))
  }

  useEffect(() => {
    if (!open) return

    // Land focus inside the panel so the keyboard path continues from the menu
    // rather than from the document root.
    const focusFrame = window.requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus()
    })

    function focusable() {
      return Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
        triggerRef.current?.focus()
        return
      }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
      const targets = focusable()
      if (targets.length === 0) return
      event.preventDefault()
      const current = targets.indexOf(document.activeElement as HTMLElement)
      const next =
        current === -1
          ? event.key === 'ArrowDown'
            ? targets[0]
            : targets[targets.length - 1]
          : targets[(current + (event.key === 'ArrowDown' ? 1 : -1) + targets.length) % targets.length]
      next.focus()
    }

    function onPointerDown(event: Event) {
      const target = event.target
      if (target && rootRef.current?.contains(target as Node)) return
      close()
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  return (
    // self-stretch + items-center makes this wrapper exactly as tall as the
    // header row, so `top-full` on the panel lands *below* the header instead of
    // half-way through it. It sits outside the primary nav so the "Admin
    // sections" landmark stays limited to the four inline links.
    <div
      ref={rootRef}
      className="relative hidden shrink-0 self-stretch items-center lg:flex"
    >
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        data-active={activeItem ? 'true' : 'false'}
        onClick={toggle}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown') return
          event.preventDefault()
          setOpenedOnPath(location.pathname)
        }}
        className={cn(
          'flex shrink-0 items-center gap-1 rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-bright',
          activeItem
            ? 'bg-gradient-to-r from-purple/25 to-cyan/25 text-text-primary ring-1 ring-purple/30'
            : 'text-text-muted hover:text-text-primary'
        )}
      >
        <span>More</span>
        <ChevronDown
          size={13}
          aria-hidden="true"
          className={cn('transition-transform duration-300', open && 'rotate-180')}
        />
      </button>

      {open ? (
        <div
          ref={panelRef}
          id={panelId}
          className="absolute right-0 top-full z-40 mt-2 w-max max-w-[min(19rem,calc(100vw-2.5rem))] rounded-2xl border border-surface-300/55 bg-surface-50/95 p-1.5 shadow-soft backdrop-blur-xl"
        >
          <nav className="flex flex-col" aria-label="More admin sections">
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                aria-current={location.pathname === item.to ? 'page' : undefined}
                onClick={close}
                className={({ isActive }) =>
                  cn(
                    'rounded-xl px-3.5 py-2.5 text-xs font-semibold uppercase tracking-[0.14em] transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-bright',
                    isActive
                      ? 'bg-gradient-to-r from-purple/25 to-cyan/25 text-text-primary ring-1 ring-purple/30'
                      : 'text-text-muted hover:bg-surface-100/50 hover:text-text-primary'
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="my-1.5 h-px bg-surface-300/40" />

          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              close()
              onSignOut()
            }}
            className="w-full justify-start"
            aria-label="Sign out"
          >
            <LogOut size={14} />
            Sign out
          </Button>
        </div>
      ) : null}
    </div>
  )
}
