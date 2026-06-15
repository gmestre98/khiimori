import { afterEach, describe, expect, it } from 'vitest'
import { setReturnTo, takeReturnTo } from './returnTo'

afterEach(() => {
  sessionStorage.clear()
})

describe('returnTo', () => {
  it('round-trips the stored destination and clears it on take', () => {
    setReturnTo('/profile')
    expect(takeReturnTo()).toBe('/profile')
    // Consumed: a second take yields nothing, so it can't be replayed.
    expect(takeReturnTo()).toBeNull()
  })

  it('is null when nothing was stored', () => {
    expect(takeReturnTo()).toBeNull()
  })
})
