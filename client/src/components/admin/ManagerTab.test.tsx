import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ManagerTab } from '@/components/admin/ManagerTab'
import type { AdminManagerChecklistItem, AdminProperty } from '@/types/admin'

const api = vi.hoisted(() => ({
  fetchAdminProperties: vi.fn(),
  fetchAdminManagerChecklist: vi.fn(),
  createAdminManagerChecklistItem: vi.fn(),
  updateAdminManagerChecklistItem: vi.fn(),
  reorderAdminManagerChecklist: vi.fn(),
  deleteAdminManagerChecklistItem: vi.fn(),
  AdminApiError: class AdminApiError extends Error {
    status: number
    details?: Array<{ field: string; message: string }>

    constructor(shape: { message: string; status: number; details?: Array<{ field: string; message: string }> }) {
      super(shape.message)
      this.status = shape.status
      this.details = shape.details
    }
  },
}))

vi.mock('@/services/admin', () => api)

const PROPERTY = {
  id: 'p1',
  name: 'Aura Cozy Penthouse 1',
  slug: 'aura-cozy-penthouse-1',
} as AdminProperty

function item(overrides: Partial<AdminManagerChecklistItem> = {}): AdminManagerChecklistItem {
  return {
    id: 'i1',
    propertyId: 'p1',
    title: 'Check the AC geyser',
    description: 'Every property has a geyser',
    isActive: true,
    sortOrder: 0,
    completionCount: 0,
    deletedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

async function renderTab(items: AdminManagerChecklistItem[] = []) {
  api.fetchAdminProperties.mockResolvedValue([PROPERTY])
  api.fetchAdminManagerChecklist.mockResolvedValue(items)
  return render(<ManagerTab />)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('confirm', vi.fn(() => true))
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('ManagerTab', () => {
  it('adds a task to the selected property, trimmed and active', async () => {
    api.createAdminManagerChecklistItem.mockResolvedValue(
      item({ id: 'i2', title: 'Replace the bathroom soap', sortOrder: 1 })
    )
    await renderTab([item()])
    await screen.findByText('Check the AC geyser')

    fireEvent.change(screen.getByLabelText('Task name'), {
      target: { value: '  Replace the bathroom soap  ' },
    })
    fireEvent.change(screen.getByLabelText('Task description'), {
      target: { value: '  Restocked monthly  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add task' }))

    await waitFor(() => {
      expect(api.createAdminManagerChecklistItem).toHaveBeenCalledWith('p1', {
        title: 'Replace the bathroom soap',
        description: 'Restocked monthly',
        isActive: true,
      })
    })
    expect(await screen.findByText('Replace the bathroom soap')).toBeTruthy()
  })

  it('rejects a blank task name before calling the API', async () => {
    await renderTab()
    fireEvent.change(screen.getByLabelText('Task name'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add task' }))

    expect(await screen.findByText('Enter the task name.')).toBeTruthy()
    expect(api.createAdminManagerChecklistItem).not.toHaveBeenCalled()
  })

  it('edits a task name and description', async () => {
    api.updateAdminManagerChecklistItem.mockResolvedValue(
      item({ title: 'Check the AC filter', description: 'Cleaned quarterly' })
    )
    await renderTab([item()])
    await screen.findByText('Check the AC geyser')

    fireEvent.click(screen.getByRole('button', { name: 'Edit Check the AC geyser' }))
    fireEvent.change(screen.getByLabelText('Edit task name'), {
      target: { value: 'Check the AC filter' },
    })
    fireEvent.change(screen.getByLabelText('Edit task description'), {
      target: { value: '  Cleaned quarterly  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(api.updateAdminManagerChecklistItem).toHaveBeenCalledWith('p1', 'i1', {
        title: 'Check the AC filter',
        description: 'Cleaned quarterly',
      })
    })
    expect(await screen.findByText('Check the AC filter')).toBeTruthy()
  })

  it('reorders tasks by sending the whole new order', async () => {
    const second = item({ id: 'i2', title: 'Take the bins out', sortOrder: 1 })
    api.reorderAdminManagerChecklist.mockResolvedValue([
      { ...second, sortOrder: 0 },
      { ...item(), sortOrder: 1 },
    ])
    await renderTab([item(), second])
    await screen.findByText('Take the bins out')

    fireEvent.click(screen.getByRole('button', { name: 'Move Check the AC geyser down' }))

    await waitFor(() => {
      expect(api.reorderAdminManagerChecklist).toHaveBeenCalledWith('p1', ['i2', 'i1'])
    })
  })

  it('turns a task off so managers stop seeing it, keeping it in the list', async () => {
    api.updateAdminManagerChecklistItem.mockResolvedValue(item({ isActive: false }))
    await renderTab([item()])
    await screen.findByText('Check the AC geyser')

    fireEvent.click(screen.getByRole('button', { name: 'Disable Check the AC geyser' }))

    await waitFor(() => {
      expect(api.updateAdminManagerChecklistItem).toHaveBeenCalledWith('p1', 'i1', {
        isActive: false,
      })
    })
    // Still visible to the admin, marked as off.
    expect(await screen.findByText('Disabled')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Enable Check the AC geyser' })).toBeTruthy()
  })

  it('warns about retained history before deleting a task', async () => {
    api.deleteAdminManagerChecklistItem.mockResolvedValue(undefined)
    api.fetchAdminManagerChecklist
      .mockResolvedValueOnce([item({ completionCount: 3 })])
      .mockResolvedValue([])
    await renderTab()
    await screen.findByText('Check the AC geyser')

    fireEvent.click(screen.getByRole('button', { name: 'Delete Check the AC geyser' }))

    await waitFor(() => {
      expect(window.confirm).toHaveBeenCalledWith(
        'Remove “Check the AC geyser” from the manager checklist? 3 historical completion records will be kept.'
      )
    })
    await waitFor(() => {
      expect(api.deleteAdminManagerChecklistItem).toHaveBeenCalledWith('p1', 'i1')
    })
    expect(await screen.findByText(/No tasks for Aura Cozy Penthouse 1 yet/)).toBeTruthy()
  })

  it('does not delete when the confirmation is declined', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false))
    await renderTab([item()])
    await screen.findByText('Check the AC geyser')

    fireEvent.click(screen.getByRole('button', { name: 'Delete Check the AC geyser' }))

    expect(api.deleteAdminManagerChecklistItem).not.toHaveBeenCalled()
    expect(screen.getByText('Check the AC geyser')).toBeTruthy()
  })

  it('lists soft-deleted tasks separately with their retained record count', async () => {
    await renderTab([
      item({ id: 'i1', deletedAt: '2026-02-01T00:00:00.000Z', completionCount: 12, isActive: false }),
    ])
    await screen.findByText('Removed tasks (history kept)')
    expect(await screen.findByText('12 completion records retained')).toBeTruthy()
  })

  it('explains a server failure without exposing internal response details', async () => {
    api.fetchAdminManagerChecklist.mockRejectedValueOnce(
      new api.AdminApiError({ message: 'Request failed. Please try again.', status: 500 })
    )
    api.fetchAdminProperties.mockResolvedValue([PROPERTY])
    render(<ManagerTab />)

    expect(
      await screen.findByText(
        'The server could not load the manager checklist. Check the server logs and confirm the manager checklist migration is applied, then retry.'
      )
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
  })
})
