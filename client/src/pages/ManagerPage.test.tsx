import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MotionGlobalConfig } from 'framer-motion'
import ManagerPage from '@/pages/ManagerPage'
import type { ManagerChecklist, ManagerChecklistItem, ManagerProperty } from '@/types/manager'

// happy-dom rejects with an AbortError when framer-motion cancels a running
// animation at unmount; the animations are irrelevant to these assertions.
MotionGlobalConfig.skipAnimations = true

const api = vi.hoisted(() => ({
  fetchManagerMe: vi.fn(),
  managerLogin: vi.fn(),
  managerLogout: vi.fn(),
  fetchManagerProperties: vi.fn(),
  fetchManagerConfig: vi.fn(),
  fetchManagerChecklist: vi.fn(),
  setManagerChecklistCompletion: vi.fn(),
  prepareManagerReport: vi.fn(),
  ManagerApiError: class ManagerApiError extends Error {
    status: number
    details?: Array<{ field: string; message: string }>

    constructor(shape: { status: number; message: string; details?: Array<{ field: string; message: string }> }) {
      super(shape.message)
      this.status = shape.status
      this.details = shape.details
    }
  },
}))

vi.mock('@/services/manager', () => api)

const PROPERTIES: ManagerProperty[] = [
  { id: 'p1', name: 'Aura Cozy Penthouse 1', slug: 'aura-cozy-penthouse-1' },
  { id: 'p2', name: 'Aura Cozy Penthouse 2', slug: 'aura-cozy-penthouse-2' },
]

function item(overrides: Partial<ManagerChecklistItem> = {}): ManagerChecklistItem {
  return {
    id: 'i1',
    title: 'Check the AC geyser',
    description: 'Every property has a geyser',
    sortOrder: 0,
    isCompleted: true,
    completedAt: '2026-09-25T07:30:00.000Z',
    ...overrides,
  }
}

function checklist(overrides: Partial<ManagerChecklist> = {}): ManagerChecklist {
  return {
    propertyId: 'p1',
    propertyName: 'Aura Cozy Penthouse 1',
    dateKey: '2026-09-25',
    items: [
      item(),
      item({ id: 'i2', title: 'Take the bins out', description: null, sortOrder: 1, isCompleted: false, completedAt: null }),
      item({ id: 'i3', title: 'Replace the bathroom soap', description: null, sortOrder: 2, isCompleted: false, completedAt: null }),
    ],
    progress: { total: 3, completed: 1, remaining: 2, percent: 33 },
    ...overrides,
  }
}

function mockSignedIn(body: ManagerChecklist = checklist()) {
  api.fetchManagerMe.mockResolvedValue({ authenticated: true, username: 'manager1' })
  api.fetchManagerProperties.mockResolvedValue(PROPERTIES)
  api.fetchManagerConfig.mockResolvedValue({ whatsappConfigured: true })
  api.fetchManagerChecklist.mockResolvedValue(body)
  api.setManagerChecklistCompletion.mockResolvedValue({ ok: true })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('open', vi.fn())
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('ManagerPage', () => {
  it('asks for credentials when there is no manager session', async () => {
    api.fetchManagerMe.mockRejectedValue(
      new api.ManagerApiError({ status: 401, message: 'Manager sign-in required.' })
    )
    render(<ManagerPage />)

    expect(await screen.findByRole('button', { name: /sign in/i })).toBeTruthy()
    expect(screen.queryByText('Manager Checklist')).toBeNull()
  })

  it('signs in with the manager credentials and loads the first property', async () => {
    api.managerLogin.mockResolvedValue({ authenticated: true, username: 'manager1' })
    mockSignedIn()
    // No session yet: the page must ask for credentials first.
    api.fetchManagerMe.mockRejectedValue(
      new api.ManagerApiError({ status: 401, message: 'Manager sign-in required.' })
    )
    render(<ManagerPage />)

    fireEvent.change(await screen.findByLabelText('Manager username'), {
      target: { value: 'manager1' },
    })
    fireEvent.change(screen.getByLabelText('Manager password'), { target: { value: 'sup3rsecret' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByText('Aura Cozy Penthouse 1')).toBeTruthy()
    expect(api.managerLogin).toHaveBeenCalledWith('manager1', 'sup3rsecret')
    expect(api.fetchManagerChecklist).toHaveBeenCalledWith('p1')
  })

  it('never sends a blank password to the server', async () => {
    api.fetchManagerMe.mockRejectedValue(
      new api.ManagerApiError({ status: 401, message: 'Manager sign-in required.' })
    )
    render(<ManagerPage />)

    fireEvent.change(await screen.findByLabelText('Manager username'), {
      target: { value: 'manager1' },
    })
    fireEvent.change(screen.getByLabelText('Manager password'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByText('Enter both your username and password.')).toBeTruthy()
    expect(api.managerLogin).not.toHaveBeenCalled()
  })

  it('shows today\'s progress for the selected property', async () => {
    mockSignedIn()
    render(<ManagerPage />)

    expect(await screen.findByText('1 / 3')).toBeTruthy()
    expect(screen.getByText('2 left · 33%')).toBeTruthy()
    expect(
      screen.getByRole('progressbar', { name: 'Checklist progress: 1 of 3 completed' })
    ).toBeTruthy()
  })

  it('ticks a task optimistically and sends the day it belongs to', async () => {
    mockSignedIn()
    render(<ManagerPage />)
    await screen.findByText('1 / 3')

    fireEvent.click(screen.getByRole('button', { name: /Take the bins out/ }))

    // The box fills in before the server answers.
    expect(await screen.findByText('2 / 3')).toBeTruthy()
    await waitFor(() => {
      expect(api.setManagerChecklistCompletion).toHaveBeenCalledWith('p1', 'i2', true, '2026-09-25')
    })
  })

  it('unticks a completed task', async () => {
    mockSignedIn()
    render(<ManagerPage />)
    await screen.findByText('1 / 3')

    fireEvent.click(screen.getByRole('button', { name: /Check the AC geyser/ }))

    expect(await screen.findByText('0 / 3')).toBeTruthy()
    await waitFor(() => {
      expect(api.setManagerChecklistCompletion).toHaveBeenCalledWith('p1', 'i1', false, '2026-09-25')
    })
  })

  it('puts the box back when the server refuses the change', async () => {
    mockSignedIn()
    api.setManagerChecklistCompletion.mockRejectedValue(
      new api.ManagerApiError({ status: 500, message: 'Server error' })
    )
    render(<ManagerPage />)
    await screen.findByText('1 / 3')

    fireEvent.click(screen.getByRole('button', { name: /Take the bins out/ }))

    expect(await screen.findByText('Something went wrong on the server. Please try again.')).toBeTruthy()
    expect(await screen.findByText('1 / 3')).toBeTruthy()
  })

  it('switches property and loads that property\'s checklist', async () => {
    mockSignedIn()
    render(<ManagerPage />)
    await screen.findByText('Aura Cozy Penthouse 1')

    fireEvent.click(screen.getByRole('button', { name: 'Aura Cozy Penthouse 2' }))

    await waitFor(() => {
      expect(api.fetchManagerChecklist).toHaveBeenCalledWith('p2')
    })
  })

  it('confirms when every task is done', async () => {
    mockSignedIn(
      checklist({
        items: checklist().items.map((item) => ({ ...item, isCompleted: true })),
        progress: { total: 3, completed: 3, remaining: 0, percent: 100 },
      })
    )
    render(<ManagerPage />)

    expect(await screen.findByText(/All tasks completed for Aura Cozy Penthouse 1/)).toBeTruthy()
  })

  it('tells the manager when a property has no tasks configured', async () => {
    mockSignedIn(
      checklist({
        items: [],
        progress: { total: 0, completed: 0, remaining: 0, percent: 0 },
      })
    )
    render(<ManagerPage />)

    expect(
      await screen.findByText(/No tasks are configured for this property yet/)
    ).toBeTruthy()
  })

  it('opens WhatsApp with the report text and does not claim it was sent', async () => {
    mockSignedIn()
    api.prepareManagerReport.mockResolvedValue({
      url: 'https://wa.me/919999999999?text=AURA%20HOMES%20report',
      message: 'AURA HOMES report',
    })
    render(<ManagerPage />)
    await screen.findByText('1 / 3')

    fireEvent.change(screen.getByLabelText('Report to admin'), {
      target: { value: '  Geyser is leaking in bathroom 2  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }))

    await waitFor(() => {
      expect(api.prepareManagerReport).toHaveBeenCalledWith('p1', 'Geyser is leaking in bathroom 2')
    })
    expect(window.open).toHaveBeenCalledWith(
      'https://wa.me/919999999999?text=AURA%20HOMES%20report',
      '_blank',
      'noopener,noreferrer'
    )
    // The box is cleared so the same report is not sent twice by accident.
    expect((screen.getByLabelText('Report to admin') as HTMLTextAreaElement).value).toBe('')
  })

  it('refuses an empty report', async () => {
    mockSignedIn()
    render(<ManagerPage />)
    await screen.findByText('1 / 3')

    fireEvent.click(screen.getByRole('button', { name: 'Send report' }))

    expect(await screen.findByText('Describe the issue before sending.')).toBeTruthy()
    expect(api.prepareManagerReport).not.toHaveBeenCalled()
  })

  it('disables reporting when WhatsApp is not configured', async () => {
    api.fetchManagerMe.mockResolvedValue({ authenticated: true, username: 'manager1' })
    api.fetchManagerProperties.mockResolvedValue(PROPERTIES)
    api.fetchManagerConfig.mockResolvedValue({ whatsappConfigured: false })
    api.fetchManagerChecklist.mockResolvedValue(checklist())
    render(<ManagerPage />)

    expect(
      await screen.findByText('WhatsApp is not set up yet, so reports cannot be sent right now.')
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Send report' })).toHaveProperty('disabled', true)
  })

  it('signs out and falls back to the login screen', async () => {
    mockSignedIn()
    api.managerLogout.mockResolvedValue(undefined)
    render(<ManagerPage />)
    await screen.findByText('1 / 3')

    fireEvent.click(screen.getAllByRole('button', { name: /log out/i })[0]!)

    expect(await screen.findByRole('button', { name: /sign in/i })).toBeTruthy()
    expect(api.managerLogout).toHaveBeenCalled()
  })
})
