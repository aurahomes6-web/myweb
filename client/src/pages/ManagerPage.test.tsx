import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

const P1 = 'Aura Cozy Penthouse 1 (Penthouse 1)'
const P2 = 'Aura Cozy Penthouse 2 (Penthouse 2)'

const TODAY = '2026-09-26'
const TOMORROW = '2026-09-27'
const HISTORICAL = '2025-12-25'
const FUTURE = '2027-01-15'

const PROMPT = 'Select a date and property to view the checklist.'
const MIDDOT = ' · '

function item(overrides: Partial<ManagerChecklistItem> = {}): ManagerChecklistItem {
  return {
    id: 'i1',
    title: 'Cleaning',
    description: null,
    sortOrder: 0,
    isCompleted: false,
    completedAt: null,
    ...overrides,
  }
}

function buildChecklist(propertyId: string, dateKey: string, completed: string[]): ManagerChecklist {
  const items = [
    item({ id: 'i1', title: 'Cleaning', sortOrder: 0 }),
    item({ id: 'i2', title: 'Fill Water', sortOrder: 1 }),
    item({ id: 'i3', title: 'Check AC', sortOrder: 2 }),
  ].map((entry) =>
    completed.includes(entry.id)
      ? { ...entry, isCompleted: true, completedAt: `${dateKey}T07:30:00.000Z` }
      : entry
  )
  const done = items.filter((entry) => entry.isCompleted).length
  return {
    propertyId,
    propertyName: PROPERTIES.find((property) => property.id === propertyId)?.name ?? propertyId,
    dateKey,
    items,
    progress: {
      total: items.length,
      completed: done,
      remaining: items.length - done,
      percent: Math.round((done / items.length) * 100),
    },
  }
}

/**
 * A stand-in server: completion state is keyed by date+property exactly like the
 * real one, so a passing test is genuinely checking the isolation.
 */
function installFakeServer(store: Record<string, string[]> = {}) {
  api.fetchManagerChecklist.mockImplementation(async (propertyId: string, dateKey?: string) =>
    buildChecklist(propertyId, dateKey ?? TODAY, store[`${propertyId}:${dateKey ?? TODAY}`] ?? [])
  )
  api.setManagerChecklistCompletion.mockImplementation(
    async (propertyId: string, itemId: string, completed: boolean, dateKey?: string) => {
      const key = `${propertyId}:${dateKey ?? TODAY}`
      const current = new Set(store[key] ?? [])
      if (completed) current.add(itemId)
      else current.delete(itemId)
      store[key] = [...current]
      return { itemId, dateKey: dateKey ?? TODAY, isCompleted: completed, completedAt: null }
    }
  )
}

function mockSignedIn(store: Record<string, string[]> = {}) {
  api.fetchManagerMe.mockResolvedValue({ authenticated: true, username: 'manager1' })
  api.fetchManagerProperties.mockResolvedValue(PROPERTIES)
  api.fetchManagerConfig.mockResolvedValue({ whatsappConfigured: true })
  installFakeServer(store)
}

const prompt = () => screen.queryByText(PROMPT)

/** Generous timeout: these lookups race the initial properties fetch. */
const FIND = { timeout: 5000 } as const

// Each test drives several sequential async lookups, so it needs a bigger budget
// than vitest's 5s default when the machine is loaded.
vi.setConfig({ testTimeout: 20000, hookTimeout: 20000 })

/** Step 1: pick the day. */
async function chooseDate(value: string) {
  fireEvent.change(await screen.findByLabelText('Select Date', undefined, FIND), { target: { value } })
}

/**
 * Step 2: pick the home. Queried by its aria-label rather than by computed
 * accessible name, which would re-walk the whole page on every poll. The
 * accessible names themselves are asserted directly in test 2.
 */
async function chooseProperty(label: string) {
  const button = await waitFor(
    () => {
      const found = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
      if (!found) throw new Error(`no property button labelled "${label}" yet`)
      return found
    },
    FIND
  )
  fireEvent.click(button)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('open', vi.fn())
  // The app remembers the selected day/home in sessionStorage, so it must be
  // cleared or one test's selection leaks into the next.
  sessionStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('ManagerPage — date-first flow', () => {
  it('holds the form back until the saved selection has been applied', async () => {
    mockSignedIn()
    // A slow connection must not let the manager pick a day that boot then wipes.
    let release!: (list: ManagerProperty[]) => void
    api.fetchManagerProperties.mockReturnValue(
      new Promise<ManagerProperty[]>((resolve) => {
        release = resolve
      })
    )
    render(<ManagerPage />)

    expect(await screen.findByRole('status', undefined, FIND)).toBeTruthy()
    // Nothing is interactive yet, so a choice cannot be lost to the restore.
    expect(screen.queryByLabelText('Select Date')).toBeNull()

    release(PROPERTIES)
    expect(await screen.findByLabelText('Select Date', undefined, FIND)).toBeTruthy()
  })

  it('1. does not show the checklist before a date is selected', async () => {
    mockSignedIn()
    render(<ManagerPage />)

    expect(await screen.findByLabelText('Select Date', undefined, FIND)).toBeTruthy()
    // Nothing about "today" or a home may leak into the page before Step 1.
    expect(prompt()).toBeTruthy()
    expect(screen.queryByText('1 / 3')).toBeNull()
    expect(screen.queryByText('Cleaning')).toBeNull()
    expect(screen.queryByRole('progressbar')).toBeNull()
    // The homes are not offered yet either.
    expect(screen.queryByRole('button', { name: /Aura Cozy Penthouse 1/ })).toBeNull()
    expect(api.fetchManagerChecklist).not.toHaveBeenCalled()
  })

  it('2. offers the property step only after a date is selected', async () => {
    mockSignedIn()
    render(<ManagerPage />)
    await screen.findByLabelText('Select Date', undefined, FIND)
    expect(screen.queryByRole('heading', { name: /Select Property/i })).toBeNull()

    await chooseDate(TODAY)

    expect(await screen.findByRole('heading', { name: /Select Property/i }, FIND)).toBeTruthy()
    // Canonical Penthouse 1 then 2 order is preserved, and each home is labelled
    // with its own identity because the seed data shares one display name.
    const listed = screen.getAllByRole('button', { name: /Aura Cozy Penthouse/ })
    expect(listed).toHaveLength(2)
    expect(listed[0]!.getAttribute('aria-label')).toBe(P1)
    expect(listed[1]!.getAttribute('aria-label')).toBe(P2)
  })

  it('3. keeps the checklist hidden until BOTH a date and a property are chosen', async () => {
    mockSignedIn()
    render(<ManagerPage />)

    await chooseDate(TODAY)
    // Date only: still just the prompt.
    expect(await screen.findByRole('heading', { name: /Select Property/i }, FIND)).toBeTruthy()
    expect(prompt()).toBeTruthy()
    expect(screen.queryByText('Cleaning')).toBeNull()
    expect(api.fetchManagerChecklist).not.toHaveBeenCalled()

    await chooseProperty(P1)

    expect(await screen.findByText('Cleaning', undefined, FIND)).toBeTruthy()
    expect(prompt()).toBeNull()
  })

  it('4. loads the checklist for the selected date and property', async () => {
    mockSignedIn()
    render(<ManagerPage />)
    await chooseDate(TOMORROW)
    await chooseProperty(P1)

    expect(await screen.findByText('Cleaning', undefined, FIND)).toBeTruthy()
    expect(api.fetchManagerChecklist).toHaveBeenCalledWith('p1', TOMORROW)
    // The header names the day and the home being worked on.
    expect(screen.getByRole('heading', { name: /Checklist for:/i })).toBeTruthy()
    expect(screen.getByText('27 Sep 2026')).toBeTruthy()
  })

  it('5. persists a tick against the selected date', async () => {
    mockSignedIn()
    render(<ManagerPage />)
    await chooseDate(TODAY)
    await chooseProperty(P1)
    await screen.findByText('Cleaning', undefined, FIND)

    fireEvent.click(screen.getByRole('button', { name: /Cleaning/ }))

    expect(await screen.findByText('1 / 3', undefined, FIND)).toBeTruthy()
    await waitFor(() => {
      expect(api.setManagerChecklistCompletion).toHaveBeenCalledWith('p1', 'i1', true, TODAY)
    })
  })

  it('6. changing the date loads a separate completion state', async () => {
    const store: Record<string, string[]> = {}
    mockSignedIn(store)
    render(<ManagerPage />)
    await chooseDate(TODAY)
    await chooseProperty(P1)
    await screen.findByText('Cleaning', undefined, FIND)

    fireEvent.click(screen.getByRole('button', { name: /Cleaning/ }))
    await screen.findByText('1 / 3', undefined, FIND)

    // Same home, next day: the tick must NOT come along.
    await chooseDate(TOMORROW)
    expect(await screen.findByText('0 / 3', undefined, FIND)).toBeTruthy()
    expect(api.fetchManagerChecklist).toHaveBeenCalledWith('p1', TOMORROW)

    // Going back shows the saved day again.
    await chooseDate(TODAY)
    expect(await screen.findByText('1 / 3', undefined, FIND)).toBeTruthy()
    expect(api.fetchManagerChecklist).toHaveBeenCalledWith('p1', TODAY)
  })

  it('7. changing the property loads a separate completion state', async () => {
    const store: Record<string, string[]> = {}
    mockSignedIn(store)
    render(<ManagerPage />)
    await chooseDate(TODAY)
    await chooseProperty(P1)
    await screen.findByText('Cleaning', undefined, FIND)

    fireEvent.click(screen.getByRole('button', { name: /Cleaning/ }))
    await screen.findByText('1 / 3', undefined, FIND)

    await chooseProperty(P2)

    expect(await screen.findByText('0 / 3', undefined, FIND)).toBeTruthy()
    expect(api.fetchManagerChecklist).toHaveBeenCalledWith('p2', TODAY)
  })

  it('8. loads the saved completion state for a historical date', async () => {
    const store: Record<string, string[]> = { [`p1:${HISTORICAL}`]: ['i1', 'i2'] }
    mockSignedIn(store)
    render(<ManagerPage />)

    await chooseDate(HISTORICAL)
    await chooseProperty(P1)

    expect(await screen.findByText('2 / 3', undefined, FIND)).toBeTruthy()
    expect(api.fetchManagerChecklist).toHaveBeenCalledWith('p1', HISTORICAL)
    // The chosen day is echoed back, not "today".
    expect(screen.getByText('25 Dec 2025')).toBeTruthy()
  })

  it('9. a future date with no completion starts unchecked', async () => {
    mockSignedIn()
    render(<ManagerPage />)

    await chooseDate(FUTURE)
    await chooseProperty(P1)

    expect(await screen.findByText('0 / 3', undefined, FIND)).toBeTruthy()
    expect(api.fetchManagerChecklist).toHaveBeenCalledWith('p1', FUTURE)
  })

  it('10. calculates progress for the selected date and property', async () => {
    const store: Record<string, string[]> = { [`p1:${TODAY}`]: ['i1', 'i2'] }
    mockSignedIn(store)
    render(<ManagerPage />)

    await chooseDate(TODAY)
    await chooseProperty(P1)

    expect(await screen.findByText('2 / 3', undefined, FIND)).toBeTruthy()
    expect(screen.getByText(['1 left', '67%'].join(MIDDOT))).toBeTruthy()
    const bar = screen.getByRole('progressbar', { name: 'Checklist progress: 2 of 3 completed' })
    expect(bar.getAttribute('aria-valuenow')).toBe('67')
  })

  it('11. a refresh restores the selection and re-reads the saved state', async () => {
    const store: Record<string, string[]> = {}
    mockSignedIn(store)
    const first = render(<ManagerPage />)
    await chooseDate(TODAY)
    await chooseProperty(P1)
    await screen.findByText('Cleaning', undefined, FIND)
    fireEvent.click(screen.getByRole('button', { name: /Cleaning/ }))
    await screen.findByText('1 / 3', undefined, FIND)
    first.unmount()

    // A refresh: the component is rebuilt from scratch and state comes from the server.
    api.fetchManagerChecklist.mockClear()
    render(<ManagerPage />)

    expect(await screen.findByText('1 / 3', undefined, FIND)).toBeTruthy()
    expect(api.fetchManagerChecklist).toHaveBeenCalledWith('p1', TODAY)
    expect((await screen.findByLabelText('Select Date', undefined, FIND)) as HTMLInputElement).toHaveProperty(
      'value',
      TODAY
    )
  })

  it('12. files the report under the selected date and property', async () => {
    mockSignedIn()
    api.prepareManagerReport.mockResolvedValue({
      url: 'https://wa.me/919999999999?text=x',
      message: 'x',
      propertyName: 'Aura Cozy Penthouse 1',
      dateKey: TODAY,
    })
    render(<ManagerPage />)
    await chooseDate(TODAY)
    await chooseProperty(P1)
    await screen.findByText('Cleaning', undefined, FIND)

    expect(screen.getByText(new RegExp(`Filed under 26 Sep 2026`))).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Report to admin'), {
      target: { value: 'Bathroom tap is leaking.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send report' }))

    await waitFor(() => {
      expect(api.prepareManagerReport).toHaveBeenCalledWith('p1', 'Bathroom tap is leaking.', TODAY)
    })
    expect(window.open).toHaveBeenCalledWith(
      'https://wa.me/919999999999?text=x',
      '_blank',
      'noopener,noreferrer'
    )
  })

  it('does not let the report be sent before a date and property are chosen', async () => {
    mockSignedIn()
    render(<ManagerPage />)
    await screen.findByLabelText('Select Date', undefined, FIND)

    expect(screen.getByRole('button', { name: 'Send report' })).toHaveProperty('disabled', true)

    // A date alone is still not enough.
    await chooseDate(TODAY)
    await screen.findByRole('heading', { name: /Select Property/i }, FIND)
    expect(screen.getByRole('button', { name: 'Send report' })).toHaveProperty('disabled', true)
  })

  it('clearing the day hides the checklist and the property step again', async () => {
    mockSignedIn()
    render(<ManagerPage />)
    await chooseDate(TODAY)
    await chooseProperty(P1)
    await screen.findByText('Cleaning', undefined, FIND)

    await chooseDate('')

    expect(await screen.findByText(PROMPT, undefined, FIND)).toBeTruthy()
    expect(screen.queryByText('Cleaning')).toBeNull()
    expect(screen.queryByRole('heading', { name: /Select Property/i })).toBeNull()
  })

  it('confirms when every task is done for the chosen day', async () => {
    const store: Record<string, string[]> = { [`p1:${TODAY}`]: ['i1', 'i2', 'i3'] }
    mockSignedIn(store)
    render(<ManagerPage />)
    await chooseDate(TODAY)
    await chooseProperty(P1)

    expect(await screen.findByText(/All tasks completed for 26 Sep 2026/, undefined, FIND)).toBeTruthy()
  })

  it('tells the manager when a property has no tasks configured', async () => {
    mockSignedIn()
    api.fetchManagerChecklist.mockResolvedValue({
      propertyId: 'p1',
      propertyName: 'Aura Cozy Penthouse 1',
      dateKey: TODAY,
      items: [],
      progress: { total: 0, completed: 0, remaining: 0, percent: 0 },
    })
    render(<ManagerPage />)
    await chooseDate(TODAY)
    await chooseProperty(P1)

    expect(
      await screen.findByText(/No tasks are configured for this property yet/, undefined, FIND)
    ).toBeTruthy()
  })

  it('puts the box back when the server refuses the change', async () => {
    mockSignedIn()
    api.setManagerChecklistCompletion.mockRejectedValue(
      new api.ManagerApiError({ status: 500, message: 'Server error' })
    )
    render(<ManagerPage />)
    await chooseDate(TODAY)
    await chooseProperty(P1)
    await screen.findByText('Cleaning', undefined, FIND)

    fireEvent.click(screen.getByRole('button', { name: /Cleaning/ }))

    expect(
      await screen.findByText('Something went wrong on the server. Please try again.', undefined, FIND)
    ).toBeTruthy()
    expect(await screen.findByText('0 / 3', undefined, FIND)).toBeTruthy()
  })
})

describe('ManagerPage — authentication (unchanged)', () => {
  it('13. asks for credentials when there is no manager session', async () => {
    api.fetchManagerMe.mockRejectedValue(
      new api.ManagerApiError({ status: 401, message: 'Manager sign-in required.' })
    )
    render(<ManagerPage />)

    expect(await screen.findByRole('button', { name: /sign in/i })).toBeTruthy()
    expect(screen.queryByLabelText('Select Date')).toBeNull()
  })

  it('13. signs in with the manager credentials and shows Step 1, not a checklist', async () => {
    api.managerLogin.mockResolvedValue({ username: 'manager1' })
    mockSignedIn()
    api.fetchManagerMe.mockRejectedValue(
      new api.ManagerApiError({ status: 401, message: 'Manager sign-in required.' })
    )
    render(<ManagerPage />)

    fireEvent.change(await screen.findByLabelText('Manager username'), {
      target: { value: 'manager1' },
    })
    fireEvent.change(screen.getByLabelText('Manager password'), { target: { value: 'sup3rsecret' } })
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByLabelText('Select Date', undefined, FIND)).toBeTruthy()
    expect(api.managerLogin).toHaveBeenCalledWith('manager1', 'sup3rsecret')
    // No home is pre-selected and nothing is fetched.
    expect(screen.queryByText('Cleaning')).toBeNull()
    expect(api.fetchManagerChecklist).not.toHaveBeenCalled()
  })

  it('13. never sends a blank password to the server', async () => {
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

  it('13. signs out and falls back to the login screen', async () => {
    mockSignedIn()
    api.managerLogout.mockResolvedValue(undefined)
    render(<ManagerPage />)
    await screen.findByLabelText('Select Date', undefined, FIND)

    fireEvent.click(screen.getAllByRole('button', { name: /log out/i })[0]!)

    expect(await screen.findByRole('button', { name: /sign in/i })).toBeTruthy()
    expect(api.managerLogout).toHaveBeenCalled()
  })

  it('13. disables reporting when WhatsApp is not configured', async () => {
    mockSignedIn()
    api.fetchManagerConfig.mockResolvedValue({ whatsappConfigured: false })
    render(<ManagerPage />)
    await chooseDate(TODAY)
    await chooseProperty(P1)
    await screen.findByText('Cleaning', undefined, FIND)

    expect(
      screen.getByText('WhatsApp is not set up yet, so reports cannot be sent right now.')
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Send report' })).toHaveProperty('disabled', true)
  })

  it('13. refuses an empty report once a day and home are chosen', async () => {
    mockSignedIn()
    render(<ManagerPage />)
    await chooseDate(TODAY)
    await chooseProperty(P1)
    await screen.findByText('Cleaning', undefined, FIND)

    fireEvent.click(screen.getByRole('button', { name: 'Send report' }))

    expect(await screen.findByText('Describe the issue before sending.', undefined, FIND)).toBeTruthy()
    expect(api.prepareManagerReport).not.toHaveBeenCalled()
  })

  it('13. surfaces an expired session from the API', async () => {
    mockSignedIn()
    api.fetchManagerChecklist.mockRejectedValue(
      new api.ManagerApiError({ status: 401, message: 'Manager sign-in required.' })
    )
    render(<ManagerPage />)
    await chooseDate(TODAY)
    await chooseProperty(P1)

    const alert = await screen.findByRole('alert', undefined, FIND)
    expect(within(alert).getByText('Your session has expired. Please sign in again.')).toBeTruthy()
  })
})
