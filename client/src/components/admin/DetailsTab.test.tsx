import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MotionGlobalConfig } from 'framer-motion'
import { DetailsTab } from '@/components/admin/DetailsTab'
import type { DetailsRecord, DetailsResponse } from '@/types/details'

// happy-dom's Web Animations implementation rejects with an AbortError when a
// running animation is cancelled, which framer-motion's exit animations do as
// soon as the tree unmounts. Animations are irrelevant to these assertions.
MotionGlobalConfig.skipAnimations = true

const api = vi.hoisted(() => ({
  fetchDetails: vi.fn(),
  downloadDetailsExcel: vi.fn(),
  downloadDetailsPdf: vi.fn(),
  saveBlob: vi.fn(),
  DetailsApiError: class DetailsApiError extends Error {
    status: number
    code: string
    details?: Array<{ field: string; message: string }>

    constructor(shape: {
      status: number
      error?: string
      message: string
      details?: Array<{ field: string; message: string }>
    }) {
      super(shape.message)
      this.status = shape.status
      this.code = shape.error ?? 'INTERNAL_ERROR'
      this.details = shape.details
    }
  },
}))

vi.mock('@/services/details', () => api)

const PROPERTIES = [
  { id: 'p1', name: 'Aura Cozy Penthouse 1', slug: 'aura-cozy-penthouse-1' },
  { id: 'p2', name: 'Aura Cozy Penthouse 2', slug: 'aura-cozy-penthouse-2' },
  { id: 'p3', name: 'Aura Cozy Penthouse 3', slug: 'aura-cozy-penthouse-3' },
]

function record(overrides: Partial<DetailsRecord> = {}): DetailsRecord {
  return {
    key: 'NORMAL:b1',
    id: 'b1',
    source: 'NORMAL',
    reference: 'AH-0001',
    propertyId: 'p1',
    propertyName: 'Aura Cozy Penthouse 1',
    propertySlug: 'aura-cozy-penthouse-1',
    checkIn: '2026-09-10',
    checkOut: '2026-09-13',
    nights: 3,
    guestName: 'Anita Sharma',
    aadhaarNumber: '123456789012',
    gender: 'FEMALE',
    age: 31,
    guestCount: 2,
    primaryPhone: '+91 9000000001',
    status: 'CONFIRMED',
    paymentStatus: 'ACCEPTED',
    amountPaise: 810000,
    originalPricePaise: 900000,
    discountPaise: 90000,
    couponCode: 'AURA10',
    bookingDate: '2026-09-02T09:00:00.000Z',
    notes: null,
    utr: 'UTR123',
    paymentSubmittedAt: null,
    paymentAcceptedAt: '2026-09-03T10:00:00.000Z',
    paymentRejectedAt: null,
    rejectionMessage: null,
    guests: [
      {
        id: 'g1',
        fullName: 'Anita Sharma',
        aadhaarNumber: '123456789012',
        gender: 'FEMALE',
        age: 31,
        phone: null,
        isPrimary: true,
      },
      {
        id: 'g2',
        fullName: 'Vikram Sharma',
        aadhaarNumber: '555544443333',
        gender: 'MALE',
        age: 34,
        phone: '+91 9000000002',
        isPrimary: false,
      },
    ],
    ...overrides,
  }
}

const AIRBNB_RECORD = record({
  key: 'AIRBNB:r1',
  id: 'r1',
  source: 'AIRBNB',
  reference: 'HM-9XYZ',
  propertyId: 'p2',
  propertyName: 'Aura Cozy Penthouse 2',
  checkIn: '2026-09-20',
  checkOut: '2026-09-22',
  nights: 2,
  guestName: 'Rohan Mehta',
  aadhaarNumber: '999988887777',
  gender: 'MALE',
  age: 40,
  guestCount: 3,
  status: 'ACTIVE',
  paymentStatus: null,
  amountPaise: null,
  discountPaise: null,
  couponCode: null,
  utr: null,
  paymentAcceptedAt: null,
  guests: [
    {
      id: 'g9',
      fullName: 'Rohan Mehta',
      aadhaarNumber: '999988887777',
      gender: 'MALE',
      age: 40,
      phone: null,
      isPrimary: true,
    },
  ],
})

function response(overrides: Partial<DetailsResponse> = {}): DetailsResponse {
  return {
    records: [record(), AIRBNB_RECORD],
    total: 2,
    page: 1,
    pageSize: 25,
    pageCount: 1,
    properties: PROPERTIES,
    summary: {
      totalBookings: 2,
      normalBookings: 1,
      airbnbBookings: 1,
      cancelledBookings: 0,
      totalGuests: 5,
      occupiedNights: 5,
      totalAmountPaise: 810000,
      amountBasis: 'NORMAL_BOOKINGS',
      byProperty: [
        { key: 'p1', label: 'Aura Cozy Penthouse 1', count: 1, guests: 2, nights: 3, amountPaise: 810000 },
        { key: 'p2', label: 'Aura Cozy Penthouse 2', count: 1, guests: 3, nights: 2, amountPaise: 0 },
      ],
      bySource: [
        { key: 'NORMAL', label: 'Normal', count: 1 },
        { key: 'AIRBNB', label: 'Airbnb', count: 1 },
      ],
      byMonth: [
        { key: '2026-09', label: '2026-09', count: 2, guests: 5, nights: 5, amountPaise: 810000 },
      ],
    },
    appliedQuery: {
      source: 'ALL',
      propertyId: null,
      status: null,
      paymentStatus: null,
      search: null,
      dateBasis: 'checkIn',
      preset: 'thisMonth',
      range: { from: '2026-09-01', to: '2026-09-30' },
      sortBy: 'checkIn',
      sortOrder: 'desc',
    },
    ...overrides,
  }
}

async function renderTab(body: DetailsResponse = response()) {
  api.fetchDetails.mockResolvedValue(body)
  return render(<DetailsTab />)
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
})

describe('DetailsTab', () => {
  it('shows normal bookings and Airbnb reservations, clearly labelled', async () => {
    await renderTab()
    expect(await screen.findByText('AH-0001')).toBeTruthy()
    expect(screen.getByText('HM-9XYZ')).toBeTruthy()
    // Both sources are identifiable, not just implied.
    expect(screen.getAllByText('NORMAL').length).toBeGreaterThan(0)
    expect(screen.getAllByText('AIRBNB').length).toBeGreaterThan(0)
  })

  it('displays the FULL Aadhaar number to the admin', async () => {
    await renderTab()
    expect(await screen.findByText('123456789012')).toBeTruthy()
    expect(screen.getByText('999988887777')).toBeTruthy()
    // Never masked in this section.
    expect(document.body.textContent).not.toContain('XXXX')
  })

  it('summarises the current filters', async () => {
    await renderTab()
    const total = (await screen.findByText('Total bookings')).parentElement
    expect(total?.textContent).toContain('2')
    expect(screen.getByText('Airbnb bookings').parentElement?.textContent).toContain('1')
    expect(screen.getByText('Occupied nights').parentElement?.textContent).toContain('5')
    // Total booking value comes from the server-stored amount.
    expect(screen.getByText('Total booking value').parentElement?.textContent).toContain('8,100')
  })

  it('labels the date basis so the range is never ambiguous', async () => {
    await renderTab()
    const line = screen.getByTestId('details-range-summary')
    expect(line?.textContent).toContain('Date: Check-in')
    expect(line?.textContent).toContain('check-in date')
  })

  it('relabels the summary line from the query the server applied', async () => {
    const applied = response({
      appliedQuery: { ...response().appliedQuery, dateBasis: 'bookingDate' },
    })
    api.fetchDetails.mockResolvedValueOnce(response()).mockResolvedValue(applied)
    await renderTab(response())
    // From here on the server answers with the other basis.
    api.fetchDetails.mockResolvedValue(applied)
    await screen.findByText('AH-0001')
    expect(screen.getByTestId('details-range-summary')?.textContent).toContain(
      'Date: Check-in'
    )

    fireEvent.change(screen.getByLabelText('Date basis'), { target: { value: 'bookingDate' } })

    const line = screen.getByTestId('details-range-summary')
    await waitFor(() => {
      expect(line?.textContent).toContain('Date: Booking Date')
    })
    expect(line?.textContent).toContain('created')
  })

  it('sends the source filter to the server', async () => {
    await renderTab()
    await screen.findByText('AH-0001')

    fireEvent.change(screen.getByLabelText('Filter by source'), { target: { value: 'AIRBNB' } })

    await waitFor(() => {
      const lastCall = api.fetchDetails.mock.calls.at(-1)?.[0]
      expect(lastCall.source).toBe('AIRBNB')
      expect(lastCall.page).toBe(1)
    })
  })

  it('combines the property, status and payment filters', async () => {
    await renderTab()
    await screen.findByText('AH-0001')

    fireEvent.change(screen.getByLabelText('Filter by property'), { target: { value: 'p2' } })
    fireEvent.change(screen.getByLabelText('Filter by booking status'), {
      target: { value: 'ACTIVE' },
    })
    fireEvent.change(screen.getByLabelText('Filter by payment status'), {
      target: { value: 'ACCEPTED' },
    })

    await waitFor(() => {
      const lastCall = api.fetchDetails.mock.calls.at(-1)?.[0]
      expect(lastCall.propertyId).toBe('p2')
      expect(lastCall.status).toBe('ACTIVE')
      expect(lastCall.paymentStatus).toBe('ACCEPTED')
    })
  })

  it('switches the date basis and the range preset', async () => {
    await renderTab()
    await screen.findByText('AH-0001')

    fireEvent.change(screen.getByLabelText('Date basis'), { target: { value: 'bookingDate' } })
    await waitFor(() => {
      expect(api.fetchDetails.mock.calls.at(-1)?.[0].dateBasis).toBe('bookingDate')
    })

    fireEvent.change(screen.getByLabelText('Date range preset'), { target: { value: 'thisYear' } })
    await waitFor(() => {
      expect(api.fetchDetails.mock.calls.at(-1)?.[0].preset).toBe('thisYear')
    })
  })

  it('reveals custom from/to fields only for the custom range', async () => {
    await renderTab()
    await screen.findByText('AH-0001')
    expect(screen.queryByLabelText('From date')).toBeNull()

    fireEvent.change(screen.getByLabelText('Date range preset'), { target: { value: 'custom' } })
    expect(await screen.findByLabelText('From date')).toBeTruthy()
    expect(screen.getByLabelText('To date')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('From date'), { target: { value: '2026-09-01' } })
    fireEvent.change(screen.getByLabelText('To date'), { target: { value: '2026-09-25' } })

    await waitFor(() => {
      const lastCall = api.fetchDetails.mock.calls.at(-1)?.[0]
      expect(lastCall.dateFrom).toBe('2026-09-01')
      expect(lastCall.dateTo).toBe('2026-09-25')
    })
  })

  it('runs a search against the server instead of filtering in the browser', async () => {
    await renderTab()
    await screen.findByText('AH-0001')

    fireEvent.change(screen.getByLabelText('Search booking details'), {
      target: { value: 'Anita' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Run search' }))

    await waitFor(() => {
      expect(api.fetchDetails.mock.calls.at(-1)?.[0].search).toBe('Anita')
    })
  })

  it('sorts by a column header, toggling direction on a second click', async () => {
    await renderTab()
    await screen.findByText('AH-0001')

    fireEvent.click(screen.getByRole('button', { name: 'Sort by Guest name' }))
    await waitFor(() => {
      const lastCall = api.fetchDetails.mock.calls.at(-1)?.[0]
      expect(lastCall.sortBy).toBe('guestName')
      expect(lastCall.sortOrder).toBe('asc')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Sort by Guest name' }))
    await waitFor(() => {
      const lastCall = api.fetchDetails.mock.calls.at(-1)?.[0]
      expect(lastCall.sortBy).toBe('guestName')
      expect(lastCall.sortOrder).toBe('desc')
    })
  })

  it('paginates on the server and resets to page 1 when filters change', async () => {
    await renderTab(response({ total: 60, pageCount: 3 }))
    await screen.findByText('AH-0001')

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    await waitFor(() => {
      expect(api.fetchDetails.mock.calls.at(-1)?.[0].page).toBe(2)
    })

    fireEvent.change(screen.getByLabelText('Filter by source'), { target: { value: 'NORMAL' } })
    await waitFor(() => {
      const lastCall = api.fetchDetails.mock.calls.at(-1)?.[0]
      expect(lastCall.page).toBe(1)
      expect(lastCall.source).toBe('NORMAL')
    })
  })

  it('changes the page size through the offered options', async () => {
    await renderTab()
    await screen.findByText('AH-0001')

    fireEvent.change(screen.getByLabelText('Rows per page'), { target: { value: '50' } })
    await waitFor(() => {
      expect(api.fetchDetails.mock.calls.at(-1)?.[0].pageSize).toBe(50)
    })
    const select = screen.getByLabelText('Rows per page') as HTMLSelectElement
    expect([...select.options].map((option) => option.value)).toEqual(['25', '50', '100'])
  })

  it('opens a detail drawer with every available field, including full Aadhaar', async () => {
    await renderTab()
    fireEvent.click(await screen.findByText('AH-0001'))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('AH-0001')).toBeTruthy()
    expect(within(dialog).getByText('Aadhaar').parentElement?.textContent).toContain('123456789012')
    // Gender and age read together, from the record the server sent.
    expect(within(dialog).getByText('Gender / Age').parentElement?.textContent).toContain(
      'Female · 31'
    )
    expect(within(dialog).getByText('AURA10')).toBeTruthy()
    expect(within(dialog).getByText('UTR123')).toBeTruthy()
    // Every guest on the booking is listed, not only the lead guest.
    expect(within(dialog).getByText('Vikram Sharma')).toBeTruthy()
    expect(within(dialog).getByText('555544443333')).toBeTruthy()

    // Close the drawer and let the exit animation finish, so unmounting at
    // cleanup does not cancel a running animation.
    fireEvent.click(within(dialog).getByRole('button', { name: /close/i }))
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })

  it('downloads Excel and PDF using the active filters', async () => {
    api.downloadDetailsExcel.mockResolvedValue({
      format: 'excel',
      fileName: 'AURA_HOMES_BOOKING_DETAILS_2026-09-01_TO_2026-09-30.xlsx',
      blob: new Blob(['x']),
    })
    api.downloadDetailsPdf.mockResolvedValue({
      format: 'pdf',
      fileName: 'AURA_HOMES_BOOKING_DETAILS_2026-09-01_TO_2026-09-30.pdf',
      blob: new Blob(['x']),
    })
    await renderTab()
    await screen.findByText('AH-0001')

    fireEvent.change(screen.getByLabelText('Filter by property'), { target: { value: 'p1' } })
    await waitFor(() => {
      expect(api.fetchDetails.mock.calls.at(-1)?.[0].propertyId).toBe('p1')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Download Excel' }))
    await waitFor(() => {
      expect(api.downloadDetailsExcel).toHaveBeenCalledWith(
        expect.objectContaining({ propertyId: 'p1' }),
        { from: '2026-09-01', to: '2026-09-30' }
      )
    })
    expect(api.saveBlob).toHaveBeenCalledWith(
      'AURA_HOMES_BOOKING_DETAILS_2026-09-01_TO_2026-09-30.xlsx',
      expect.anything()
    )

    fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }))
    await waitFor(() => {
      expect(api.downloadDetailsPdf).toHaveBeenCalled()
    })
  })

  it('explains a filter validation error from the server', async () => {
    api.fetchDetails.mockRejectedValue(
      new api.DetailsApiError({
        status: 400,
        error: 'VALIDATION_ERROR',
        message: 'Please review the highlighted filters.',
        details: [{ field: 'pageSize', message: 'pageSize must be one of: 25, 50, 100.' }],
      })
    )
    render(<DetailsTab />)

    expect(await screen.findByText('pageSize must be one of: 25, 50, 100.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
  })

  it('says when nothing matches the filters', async () => {
    await renderTab(response({ records: [], total: 0 }))
    expect(await screen.findAllByText('No bookings match the selected filters.')).toHaveLength(1)
  })
})
