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

function renderShell() {
  return render(
    <MemoryRouter initialEntries={['/admin/coupons']}>
      <Routes>
        <Route path="/admin/*" element={<AdminShell onLoggedOut={vi.fn()} />} />
      </Routes>
    </MemoryRouter>
  )
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
