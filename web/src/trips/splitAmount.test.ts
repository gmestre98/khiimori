import { describe, it, expect } from 'vitest'
import { splitAmount } from './splitAmount'

describe('splitAmount', () => {
  it('divides evenly when it can', () => {
    expect(splitAmount(840, 3)).toEqual([280, 280, 280])
  })

  it('spreads the rounding remainder one cent at a time across the first legs', () => {
    expect(splitAmount(10, 3)).toEqual([3.34, 3.33, 3.33])
  })

  it('always sums back to the exact total to the cent', () => {
    for (const [total, n] of [
      [841, 3],
      [100, 7],
      [0.1, 3],
      [1234.56, 5],
    ] as const) {
      const parts = splitAmount(total, n)
      expect(parts).toHaveLength(n)
      const sum = Math.round(parts.reduce((a, b) => a + b, 0) * 100)
      expect(sum).toBe(Math.round(total * 100))
    }
  })

  it('returns the whole amount for a single leg', () => {
    expect(splitAmount(199.99, 1)).toEqual([199.99])
  })
})
