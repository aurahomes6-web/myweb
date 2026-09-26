import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AdminShell } from '@/components/admin/AdminShell'

const admin = vi.hoisted(() => ({
  adminLogout: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/services/admin', () => admin)
vi.mock('@/components/admin/BookingsTab', () => ({ BookingsTab: () => <div>Bookings tab</div> }))
vi.mock('@/components/admin/PaymentsTab', () => ({ PaymentsTab: () => <div>Payments tab</div> }))
vi.mock('@/components/admin/PaymentSettingsTab', () => ({ PaymentSettingsTab: () => <div>Payment settings tab</div> }))
vi.mock('@/components/admin/AirbnbTab', () => ({ AirbnbTab: () => <div>Airbnb tab</div> }))
vi.mock('@/components/admin/PropertiesTab', () => ({ PropertiesTab: () => <div>Properties tab</div> }))
vi.mock('@/components/admin/HomepageSettingsTab', () => ({ HomepageSettingsTab: () => <div>Homepage tab</div> }))
vi.mock('@/components/admin/MarqueeNotificationsTab', () => ({ MarqueeNotificationsTab: () => <div>Marquee tab</div> }))
vi.mock('@/components/admin/CouponsTab', () => ({ CouponsTab: () => <div>Coupons tab</div> }))
vi.mock('@/components/admin/ContactTab', () => ({ ContactTab: () => <div>Contact tab</div> }))
vi.mock('@/components/admin/CleanupTab', () => ({ CleanupTab: () => <div>Cleanup tab</div> }))
vi.mock('@/components/admin/BlockDatesTab', () => ({ BlockDatesTab: () => <div>Block dates tab</div> }))
vi.mock('@/components/admin/DetailsTab', () => ({ DetailsTab: () => <div>Details tab</div> }))
vi.mock('@/components/admin/ManagerTab', () => ({ ManagerTab: () => <div>Manager tab</div> }))

function renderShell({ initialEntry = '/admin/coupons', onLoggedOut = vi.fn() } = {}) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/admin/*" element={<AdminShell onLoggedOut={onLoggedOut} />} />
      </Routes>
    </MemoryRouter>
  )
}

const PRIMARY_SECTIONS = ['Bookings', 'Payments', 'Payment Settings', 'Airbnb']
const MORE_SECTIONS = [
  'Properties',
  'Homepage',
  'Marquee',
  'Coupons',
  'Contact',
  'Cleanup',
  'Block Dates',
  'Details',
  'Manager',
]

function moreTrigger() {
  return screen.getByRole('button', { name: 'More' })
}

async function openMoreMenu() {
  fireEvent.click(moreTrigger())
  return screen.findByRole('navigation', { name: 'More admin sections' })
}

/** The panel is only reachable through `aria-controls`, so this also proves the wiring. */
function morePanel() {
  return document.getElementById(moreTrigger().getAttribute('aria-controls') ?? '')
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('AdminShell navigation', () => {
  it('lists every section in the agreed order, ending with sign out', async () => {
    renderShell()
    fireEvent.click(screen.getByRole('button', { name: 'Open admin menu' }))

    const dialog = await screen.findByRole('dialog', { name: 'Admin navigation' })
    const navigation = within(dialog).getByRole('navigation', { name: 'Admin sections' })
    // Order is part of the requirement, not an accident of the JSX.
    expect([...navigation.querySelectorAll('a, button')].map((node) => node.textContent)).toEqual([
      'Bookings',
      'Payments',
      'Payment Settings',
      'Airbnb',
      'Properties',
      'Homepage',
      'Marquee',
      'Coupons',
      'Contact',
      'Cleanup',
      'Block Dates',
      'Details',
      'Manager',
      'Sign out',
    ])
  })

  it('never links to the manager panel from the admin navigation', async () => {
    renderShell()
    fireEvent.click(screen.getByRole('button', { name: 'Open admin menu' }))

    const dialog = await screen.findByRole('dialog', { name: 'Admin navigation' })
    // "Manager" here configures the checklist. The manager panel at /manager is
    // reached by typing the path, so it must not appear as a link.
    expect(within(dialog).getByRole('link', { name: 'Manager' }).getAttribute('href')).toBe(
      '/admin/manager'
    )
    expect(dialog.querySelector('a[href="/manager"]')).toBeNull()
  })

  it('provides every section, sign out, and a clear active item in the mobile menu', async () => {
    renderShell()
    const openButton = screen.getByRole('button', { name: 'Open admin menu' })
    fireEvent.click(openButton)

    const dialog = await screen.findByRole('dialog', { name: 'Admin navigation' })
    const navigation = within(dialog).getByRole('navigation', { name: 'Admin sections' })
    for (const label of [
      'Bookings',
      'Payments',
      'Payment Settings',
      'Airbnb',
      'Properties',
      'Homepage',
      'Marquee',
      'Coupons',
      'Contact',
      'Cleanup',
      'Block Dates',
      'Details',
      'Manager',
      'Sign out',
    ]) {
      expect(within(navigation).getByText(label)).toBeTruthy()
    }
    expect(within(navigation).getByRole('link', { name: 'Coupons' }).getAttribute('aria-current')).toBe('page')

    const closeButton = within(dialog).getByRole('button', { name: 'Close admin menu' })
    await waitFor(() => expect(document.activeElement === closeButton).toBe(true))

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement === within(navigation).getByRole('button', { name: 'Sign out' })).toBe(true)
  })

  it('closes after selection, on Escape, and on a backdrop click while restoring focus', async () => {
    renderShell()
    const openButton = screen.getByRole('button', { name: 'Open admin menu' })

    fireEvent.click(openButton)
    const firstDialog = await screen.findByRole('dialog', { name: 'Admin navigation' })
    fireEvent.click(within(firstDialog).getByRole('link', { name: 'Marquee' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Admin navigation' })).toBeNull())
    await waitFor(() => expect(document.activeElement === openButton).toBe(true))

    fireEvent.click(openButton)
    const escapeDialog = await screen.findByRole('dialog', { name: 'Admin navigation' })
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(escapeDialog.isConnected).toBe(false))
    await waitFor(() => expect(document.activeElement === openButton).toBe(true))

    fireEvent.click(openButton)
    const backdropDialog = await screen.findByRole('dialog', { name: 'Admin navigation' })
    fireEvent.pointerDown(backdropDialog)
    await waitFor(() => expect(backdropDialog.isConnected).toBe(false))
    await waitFor(() => expect(document.activeElement === openButton).toBe(true))
  })
})

describe('AdminShell desktop header', () => {
  it('keeps only the four primary sections in the header row', () => {
    renderShell()

    const desktopNav = screen.getByRole('navigation', { name: 'Admin sections' })
    expect([...desktopNav.querySelectorAll('a')].map((node) => node.textContent)).toEqual(PRIMARY_SECTIONS)
    // The overflow trigger is a sibling of the nav, not one of its links.
    expect(desktopNav.querySelector('button')).toBeNull()
  })

  it('puts every remaining section and sign out behind More, in order', async () => {
    renderShell()
    const menu = await openMoreMenu()

    expect([...menu.querySelectorAll('a')].map((node) => node.textContent)).toEqual(MORE_SECTIONS)
    // The panel order ends with sign out, so nothing was dropped in the move.
    const panel = morePanel()
    expect(panel).toBeTruthy()
    expect([...(panel?.querySelectorAll('a, button') ?? [])].map((node) => node.textContent)).toEqual([
      ...MORE_SECTIONS,
      'Sign out',
    ])
  })

  it('never removes a section: the header and More together cover every route', async () => {
    renderShell()
    const menu = await openMoreMenu()

    const hrefs = [
      ...screen.getByRole('navigation', { name: 'Admin sections' }).querySelectorAll('a'),
      ...menu.querySelectorAll('a'),
    ].map((node) => node.getAttribute('href'))

    expect(hrefs).toEqual([
      '/admin',
      '/admin/payments',
      '/admin/payment-settings',
      '/admin/airbnb',
      '/admin/properties',
      '/admin/homepage',
      '/admin/marquee-notifications',
      '/admin/coupons',
      '/admin/contact',
      '/admin/cleanup',
      '/admin/block-dates',
      '/admin/details',
      '/admin/manager',
    ])
    expect(within(menu).getByRole('link', { name: 'Manager' })).toBeTruthy()
  })

  it('never links to the manager panel from More', async () => {
    renderShell()
    await openMoreMenu()

    // "Manager" here configures the checklist. The manager panel at /manager is
    // reached by typing the path, so it must not appear as a link.
    const panel = morePanel() as HTMLElement
    expect(within(panel).getByRole('link', { name: 'Manager' }).getAttribute('href')).toBe('/admin/manager')
    expect(panel.querySelector('a[href="/manager"]')).toBeNull()
  })

  it('marks the active section on the trigger and inside the menu', async () => {
    renderShell({ initialEntry: '/admin/coupons' })
    expect(moreTrigger().getAttribute('data-active')).toBe('true')

    const menu = await openMoreMenu()
    expect(within(menu).getByRole('link', { name: 'Coupons' }).getAttribute('aria-current')).toBe('page')
    expect(within(menu).getByRole('link', { name: 'Details' }).getAttribute('aria-current')).toBeNull()

    cleanup()
    // A primary section must not light up the overflow trigger.
    renderShell({ initialEntry: '/admin/payments' })
    expect(moreTrigger().getAttribute('data-active')).toBe('false')
    expect(
      screen
        .getByRole('navigation', { name: 'Admin sections' })
        .querySelector('a[href="/admin/payments"]')
        ?.getAttribute('aria-current')
    ).toBe('page')
  })

  it('opens on click, toggles closed on a second click, and signals its state', async () => {
    renderShell()
    expect(moreTrigger().getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('navigation', { name: 'More admin sections' })).toBeNull()

    await openMoreMenu()
    expect(moreTrigger().getAttribute('aria-expanded')).toBe('true')

    fireEvent.click(moreTrigger())
    await waitFor(() => expect(screen.queryByRole('navigation', { name: 'More admin sections' })).toBeNull())
    expect(moreTrigger().getAttribute('aria-expanded')).toBe('false')
  })

  it('moves focus into the menu and supports arrow-key navigation', async () => {
    renderShell()
    const trigger = moreTrigger()
    trigger.focus()
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })

    const menu = await screen.findByRole('navigation', { name: 'More admin sections' })
    await waitFor(() =>
      expect(document.activeElement === within(menu).getByRole('link', { name: 'Properties' })).toBe(true)
    )

    fireEvent.keyDown(document, { key: 'ArrowDown' })
    expect(document.activeElement === within(menu).getByRole('link', { name: 'Homepage' })).toBe(true)
    fireEvent.keyDown(document, { key: 'ArrowUp' })
    expect(document.activeElement === within(menu).getByRole('link', { name: 'Properties' })).toBe(true)
  })

  it('closes on Escape and hands focus back to the trigger', async () => {
    renderShell()
    const trigger = moreTrigger()
    await openMoreMenu()

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('navigation', { name: 'More admin sections' })).toBeNull())
    await waitFor(() => expect(document.activeElement === trigger).toBe(true))
  })

  it('closes on an outside press but ignores presses inside the panel', async () => {
    renderShell()
    const menu = await openMoreMenu()

    fireEvent.pointerDown(within(menu).getByRole('link', { name: 'Marquee' }))
    expect(screen.queryByRole('navigation', { name: 'More admin sections' })).toBeTruthy()

    fireEvent.pointerDown(document.body)
    await waitFor(() => expect(screen.queryByRole('navigation', { name: 'More admin sections' })).toBeNull())
  })

  it('closes after a section is selected and renders that section', async () => {
    renderShell()
    const menu = await openMoreMenu()

    fireEvent.click(within(menu).getByRole('link', { name: 'Marquee' }))
    await waitFor(() => expect(screen.queryByRole('navigation', { name: 'More admin sections' })).toBeNull())
    expect(screen.getByText('Marquee tab')).toBeTruthy()

    // Navigating to a primary section must dismiss it too.
    await openMoreMenu()
    fireEvent.click(screen.getByRole('navigation', { name: 'Admin sections' }).querySelector('a[href="/admin"]')!)
    await waitFor(() => expect(screen.queryByRole('navigation', { name: 'More admin sections' })).toBeNull())
    expect(screen.getByText('Bookings tab')).toBeTruthy()
  })

  it('signs out from More', async () => {
    const onLoggedOut = vi.fn()
    renderShell({ onLoggedOut })
    await openMoreMenu()

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    await waitFor(() => expect(onLoggedOut).toHaveBeenCalledTimes(1))
    expect(admin.adminLogout).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('navigation', { name: 'More admin sections' })).toBeNull()
  })

  it('drops the panel below the header and never scrolls the header sideways', async () => {
    renderShell()
    const desktopNav = screen.getByRole('navigation', { name: 'Admin sections' })
    // No overflow wrapper: the row must fit rather than scroll.
    expect(desktopNav.className).not.toContain('overflow')

    await openMoreMenu()
    const panelClass = morePanel()?.className ?? ''
    // top-full from a full-height trigger puts the panel under the header bar
    // instead of over it; right-0 keeps it on screen at narrow widths.
    expect(panelClass).toContain('top-full')
    expect(panelClass).toContain('right-0')
    expect(panelClass).toContain('max-w-')
  })

  it('switches to the header row and the hamburger at one shared breakpoint', async () => {
    renderShell()
    const desktopNav = screen.getByRole('navigation', { name: 'Admin sections' })
    const hamburger = screen.getByRole('button', { name: 'Open admin menu' })

    // Both must flip on the same width, otherwise the header can show the full
    // row and the hamburger at once (or neither).
    expect(desktopNav.className).toContain('lg:flex')
    expect(hamburger.className).toContain('lg:hidden')

    // Opening More must not disturb the mobile drawer, and vice versa.
    await openMoreMenu()
    expect(screen.queryByRole('dialog', { name: 'Admin navigation' })).toBeNull()
    fireEvent.click(hamburger)
    expect(await screen.findByRole('dialog', { name: 'Admin navigation' })).toBeTruthy()
    expect(screen.getByRole('navigation', { name: 'More admin sections' })).toBeTruthy()
  })
})
