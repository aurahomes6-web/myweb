import { describe, expect, it } from 'vitest'
import { formatINR, parseINRToPaise, resolveNightlyPricing } from '@/lib/money'

describe('resolveNightlyPricing', () => {
  it('uses the original price when no discount is configured', () => {
    expect(resolveNightlyPricing(300000, null)).toEqual({
      effectivePricePaise: 300000,
      hasDiscount: false,
      discountPercent: null,
    })
  })

  it('uses a valid discounted price and calculates the percentage', () => {
    expect(resolveNightlyPricing(300000, 240000)).toEqual({
      effectivePricePaise: 240000,
      hasDiscount: true,
      discountPercent: 20,
    })
  })

  it('falls back to the original price for invalid discounts', () => {
    for (const discountedPricePaise of [0, -1, 300000, 350000, 240000.5]) {
      expect(resolveNightlyPricing(300000, discountedPricePaise)).toEqual({
        effectivePricePaise: 300000,
        hasDiscount: false,
        discountPercent: null,
      })
    }
  })

  it('does not claim a percentage for a sub-one-percent discount', () => {
    expect(resolveNightlyPricing(300000, 299999)).toEqual({
      effectivePricePaise: 299999,
      hasDiscount: true,
      discountPercent: 0,
    })
  })
})

describe('money helpers', () => {
  it('formats and parses INR values consistently', () => {
    expect(formatINR(300000)).toBe('₹3,000')
    expect(parseINRToPaise('₹2,400.50')).toBe(240050)
  })
})
