import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import HomePage from '@/pages/HomePage'

const api = vi.hoisted(() => ({
  useMarqueeNotifications: vi.fn(),
  useReducedMotion: vi.fn(),
}))

vi.mock('@/services/marqueeNotifications', () => ({
  useMarqueeNotifications: api.useMarqueeNotifications,
}))

vi.mock('@/hooks/useReducedMotion', () => ({
  useReducedMotion: api.useReducedMotion,
}))

vi.mock('@/components/sections/Hero', () => ({
  default: () => <div data-testid="hero" />,
}))

vi.mock('@/components/sections/PropertiesSection', () => ({
  default: () => <div data-testid="properties" />,
}))

vi.mock('@/components/sections/FeatureSection', () => ({
  default: () => <div data-testid="features" />,
}))

vi.mock('@/components/sections/CTASection', () => ({
  default: () => <div data-testid="cta" />,
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('homepage marquee notifications', () => {
  it('hides the marquee when no active notifications exist', () => {
    api.useMarqueeNotifications.mockReturnValue([])
    api.useReducedMotion.mockReturnValue(false)

    const { container } = render(<HomePage />)

    expect(screen.getByTestId('hero')).toBeTruthy()
    expect(screen.getByTestId('properties')).toBeTruthy()
    expect(container.querySelector('[aria-label="AURA HOMES announcements"]')).toBeNull()
  })

  it('renders active notifications in a duplicated seamless sequence between hero and properties', () => {
    api.useMarqueeNotifications.mockReturnValue([
      { id: 'first', message: 'Welcome to AURA HOMES' },
      { id: 'second', message: 'Plan your next escape' },
    ])
    api.useReducedMotion.mockReturnValue(false)

    const { container } = render(<HomePage />)

    expect(screen.getAllByText('Welcome to AURA HOMES')).toHaveLength(2)
    expect(screen.getAllByText('Plan your next escape')).toHaveLength(2)
    expect(document.querySelector('.aura-marquee-track')).not.toBeNull()
    const sections = Array.from(container.children)
    expect(sections[0].getAttribute('data-testid')).toBe('hero')
    expect(sections[1].getAttribute('aria-label')).toBe('AURA HOMES announcements')
    expect(sections[2].getAttribute('data-testid')).toBe('properties')
  })

  it('uses a scrollable track instead of continuous motion when reduced motion is requested', () => {
    api.useMarqueeNotifications.mockReturnValue([
      { id: 'first', message: 'Welcome to AURA HOMES' },
    ])
    api.useReducedMotion.mockReturnValue(true)

    render(<HomePage />)

    const marquee = screen.getByRole('region', { name: 'AURA HOMES announcements' })
    expect(marquee.firstElementChild?.classList.contains('overflow-x-auto')).toBe(true)
    expect(marquee.firstElementChild?.classList.contains('overflow-hidden')).toBe(false)
  })
})
