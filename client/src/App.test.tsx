import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MotionGlobalConfig } from 'framer-motion'

// Page transitions animate on route change; happy-dom rejects the cancelled
// animation at unmount, which is noise for a routing test.
MotionGlobalConfig.skipAnimations = true

// The public shell is not what is under test here; stub the heavy pages so the
// routing table can be inspected on its own.
vi.mock('@/components/layout/Navbar', () => ({
  default: () => <nav data-testid="public-navbar" />,
}))
vi.mock('@/components/layout/Footer', () => ({
  default: () => <footer data-testid="public-footer" />,
}))
vi.mock('@/pages/AdminPage', () => ({ default: () => <div data-testid="admin-page" /> }))
vi.mock('@/pages/ManagerPage', () => ({ default: () => <div data-testid="manager-page" /> }))
vi.mock('@/pages/HomePage', () => ({ default: () => <div data-testid="home-page" /> }))
vi.mock('@/pages/NotFoundPage', () => ({ default: () => <div data-testid="not-found" /> }))

afterEach(() => {
  cleanup()
  window.history.pushState({}, '', '/')
})

describe('App routing', () => {
  it('serves the manager panel at /manager', async () => {
    window.history.pushState({}, '', '/manager')
    const { default: App } = await import('@/App')
    render(<App />)

    expect(await screen.findByTestId('manager-page')).toBeTruthy()
    // Deliberately outside the public shell: no navbar, no footer.
    expect(screen.queryByTestId('public-navbar')).toBeNull()
    expect(screen.queryByTestId('public-footer')).toBeNull()
  })

  it('keeps /admin outside the public shell too', async () => {
    window.history.pushState({}, '', '/admin')
    const { default: App } = await import('@/App')
    render(<App />)

    expect(await screen.findByTestId('admin-page')).toBeTruthy()
    expect(screen.queryByTestId('public-navbar')).toBeNull()
  })

  it('wraps every public route in the navbar and footer', async () => {
    window.history.pushState({}, '', '/')
    const { default: App } = await import('@/App')
    render(<App />)

    expect(await screen.findByTestId('home-page')).toBeTruthy()
    expect(screen.getByTestId('public-navbar')).toBeTruthy()
    expect(screen.getByTestId('public-footer')).toBeTruthy()
  })
})
