import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HomepageSettingsTab } from '@/components/admin/HomepageSettingsTab'
import { AdminApiError } from '@/services/admin'
import type { AdminHomepageSettings } from '@/types/admin'

const api = vi.hoisted(() => ({
  fetchAdminHomepageSettings: vi.fn(),
  updateAdminHomepageSettings: vi.fn(),
  uploadAdminHomepageVisual: vi.fn(),
  resetAdminHomepageVisual: vi.fn(),
}))

vi.mock('@/services/admin', () => {
  class MockAdminApiError extends Error {
    status: number
    code: string
    details?: Array<{ field: string; message: string }>

    constructor(shape: {
      status: number
      error: string
      message: string
      details?: Array<{ field: string; message: string }>
    }) {
      super(shape.message)
      this.name = 'AdminApiError'
      this.status = shape.status
      this.code = shape.error
      this.details = shape.details
    }
  }

  return {
    AdminApiError: MockAdminApiError,
    ...api,
  }
})

const fallback: AdminHomepageSettings = {
  visualImageUrl: null,
  visualImageAlt: 'Aura Cozy Penthouse — interior',
  visualSource: 'fallback',
}

const custom: AdminHomepageSettings = {
  visualImageUrl: 'https://blob.example/homepage/visual-current.jpg',
  visualImageAlt: 'Rooftop terrace suite',
  visualSource: 'custom',
}

function file(name = 'homepage.png') {
  return new File(['image'], name, { type: 'image/png' })
}

async function renderTab(settings: AdminHomepageSettings = fallback) {
  api.fetchAdminHomepageSettings.mockResolvedValue(settings)
  const result = render(<HomepageSettingsTab />)
  await screen.findByDisplayValue(settings.visualImageAlt)
  return result
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
})

describe('HomepageSettingsTab', () => {
  it('renders the separate Homepage settings UI and current fallback artwork', async () => {
    const { container } = await renderTab()

    expect(screen.getAllByText('Homepage Visual').length).toBeGreaterThan(0)
    expect(
      screen.getByText(
        'This image is displayed on the homepage and is independent of individual property images.'
      )
    ).toBeTruthy()
    expect(screen.getByText('Using the built-in homepage artwork.')).toBeTruthy()
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('uploads a first image, shows loading state, and previews the returned custom visual', async () => {
    let resolveUpload: ((settings: AdminHomepageSettings) => void) | undefined
    api.uploadAdminHomepageVisual.mockImplementation(
      () => new Promise<AdminHomepageSettings>((resolve) => {
        resolveUpload = resolve
      })
    )
    const { container } = await renderTab()
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const selected = file()

    fireEvent.change(input, { target: { files: [selected] } })

    expect(screen.getByText('Uploading…')).toBeTruthy()
    expect(api.uploadAdminHomepageVisual).toHaveBeenCalledWith(selected)

    resolveUpload?.(custom)
    await waitFor(() => {
      expect(container.querySelector('img')?.getAttribute('src')).toBe(custom.visualImageUrl)
    })
    expect(screen.getByText('Homepage visual uploaded successfully.')).toBeTruthy()
  })

  it('replaces an existing visual without using a property image endpoint', async () => {
    api.uploadAdminHomepageVisual.mockResolvedValue({
      ...custom,
      visualImageUrl: 'https://blob.example/homepage/visual-replaced.jpg',
    })
    const { container } = await renderTab(custom)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement

    expect(screen.getByText('Replace Image')).toBeTruthy()
    fireEvent.change(input, { target: { files: [file('replacement.jpg')] } })

    await waitFor(() => {
      expect(container.querySelector('img')?.getAttribute('src')).toBe(
        'https://blob.example/homepage/visual-replaced.jpg'
      )
    })
    expect(api.uploadAdminHomepageVisual).toHaveBeenCalledTimes(1)
  })

  it('resets the custom visual back to the built-in artwork', async () => {
    api.resetAdminHomepageVisual.mockResolvedValue({
      ...fallback,
      visualImageAlt: custom.visualImageAlt,
    })
    const { container } = await renderTab(custom)

    fireEvent.click(screen.getByRole('button', { name: 'Reset Image' }))

    await waitFor(() => {
      expect(container.querySelector('svg')).not.toBeNull()
      expect(container.querySelector('img')).toBeNull()
    })
    expect(api.resetAdminHomepageVisual).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Homepage visual reset to the built-in artwork.')).toBeTruthy()
  })

  it('loads alt text, enables saving after an edit, and persists it', async () => {
    api.updateAdminHomepageSettings.mockResolvedValue({
      ...fallback,
      visualImageAlt: 'Rooftop terrace suite',
    })
    await renderTab()
    const input = screen.getByDisplayValue(fallback.visualImageAlt)
    const save = screen.getByRole('button', { name: 'Save Changes' }) as HTMLButtonElement
    expect(save.disabled).toBe(true)

    fireEvent.change(input, { target: { value: 'Rooftop terrace suite' } })
    expect(save.disabled).toBe(false)
    fireEvent.click(save)

    await waitFor(() => {
      expect(api.updateAdminHomepageSettings).toHaveBeenCalledWith('Rooftop terrace suite')
    })
    expect(await screen.findByText('Homepage visual alt text saved.')).toBeTruthy()
  })

  it('shows upload and validation error states', async () => {
    api.uploadAdminHomepageVisual.mockRejectedValue(
      new AdminApiError({
        status: 400,
        error: 'INVALID_IMAGE',
        message: 'Only JPEG, PNG, WebP, GIF and AVIF images are allowed.',
      })
    )
    api.updateAdminHomepageSettings.mockRejectedValue(
      new AdminApiError({
        status: 400,
        error: 'VALIDATION_ERROR',
        message: 'Please review the highlighted fields.',
        details: [{ field: 'visualImageAlt', message: 'Alt text is required.' }],
      })
    )
    const { container } = await renderTab()
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement

    fireEvent.change(fileInput, { target: { files: [file('invalid.txt')] } })
    expect(
      await screen.findByText('Only JPEG, PNG, WebP, GIF and AVIF images are allowed.')
    ).toBeTruthy()

    const altInput = screen.getByDisplayValue(fallback.visualImageAlt)
    fireEvent.change(altInput, { target: { value: 'Updated alt' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

    expect(await screen.findByText('Please review the highlighted fields.')).toBeTruthy()
    expect(screen.getByRole('listitem').textContent).toBe('visualImageAlt: Alt text is required.')
  })
})
