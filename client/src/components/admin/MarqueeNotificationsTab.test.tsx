import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MarqueeNotificationsTab } from '@/components/admin/MarqueeNotificationsTab'
import type { AdminMarqueeNotification } from '@/types/admin'

const api = vi.hoisted(() => ({
  fetchAdminMarqueeNotifications: vi.fn(),
  createAdminMarqueeNotification: vi.fn(),
  updateAdminMarqueeNotification: vi.fn(),
  reorderAdminMarqueeNotifications: vi.fn(),
  deleteAdminMarqueeNotification: vi.fn(),
  AdminApiError: class AdminApiError extends Error {},
}))

vi.mock('@/services/admin', () => api)

const first: AdminMarqueeNotification = {
  id: 'first',
  message: 'First notice',
  isActive: true,
  sort: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const second: AdminMarqueeNotification = {
  id: 'second',
  message: 'Second notice',
  isActive: false,
  sort: 1,
  createdAt: '2026-01-02T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
}

async function renderTab(notifications: AdminMarqueeNotification[] = []) {
  api.fetchAdminMarqueeNotifications.mockResolvedValue(notifications)
  return render(<MarqueeNotificationsTab />)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('confirm', vi.fn(() => true))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('MarqueeNotificationsTab', () => {
  it('creates a trimmed active notification and appends it to the order', async () => {
    const created: AdminMarqueeNotification = {
      id: 'created',
      message: 'Welcome to AURA HOMES',
      isActive: true,
      sort: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    api.createAdminMarqueeNotification.mockResolvedValue(created)
    await renderTab()

    fireEvent.change(screen.getByLabelText('Notification text'), {
      target: { value: '  Welcome to AURA HOMES  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add notification' }))

    await waitFor(() => {
      expect(api.createAdminMarqueeNotification).toHaveBeenCalledWith({
        message: 'Welcome to AURA HOMES',
        isActive: true,
      })
    })
    expect(await screen.findByText('Welcome to AURA HOMES')).toBeTruthy()
  })

  it('edits, toggles, reorders, and deletes notifications', async () => {
    api.updateAdminMarqueeNotification
      .mockResolvedValueOnce({ ...first, message: 'Updated notice' })
      .mockResolvedValueOnce({ ...first, message: 'Updated notice', isActive: false })
    api.reorderAdminMarqueeNotifications.mockResolvedValue([
      { ...second, sort: 0 },
      { ...first, message: 'Updated notice', isActive: false, sort: 1 },
    ])
    api.deleteAdminMarqueeNotification.mockResolvedValue(undefined)
    await renderTab([first, second])
    await screen.findByText('First notice')

    fireEvent.click(screen.getByRole('button', { name: 'Edit First notice' }))
    fireEvent.change(screen.getByLabelText('Edit notification'), {
      target: { value: 'Updated notice' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Updated notice')).toBeTruthy()
    expect(api.updateAdminMarqueeNotification).toHaveBeenCalledWith('first', {
      message: 'Updated notice',
    })

    fireEvent.click(screen.getByRole('button', { name: 'Disable Updated notice' }))
    await waitFor(() => {
      expect(api.updateAdminMarqueeNotification).toHaveBeenCalledWith('first', { isActive: false })
    })

    fireEvent.click(screen.getByRole('button', { name: 'Move Updated notice down' }))
    await waitFor(() => {
      expect(api.reorderAdminMarqueeNotifications).toHaveBeenCalledWith(['second', 'first'])
    })

    fireEvent.click(screen.getByRole('button', { name: 'Delete Updated notice' }))
    await waitFor(() => {
      expect(api.deleteAdminMarqueeNotification).toHaveBeenCalledWith('first')
    })
    expect(screen.queryByText('Updated notice')).toBeNull()
  })

  it('rejects blank notification text before calling the API', async () => {
    await renderTab()

    fireEvent.change(screen.getByLabelText('Notification text'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add notification' }))

    expect(await screen.findByText('Enter the notification text.')).toBeTruthy()
    expect(api.createAdminMarqueeNotification).not.toHaveBeenCalled()
  })
})
