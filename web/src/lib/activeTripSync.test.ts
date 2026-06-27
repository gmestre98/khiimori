import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { setActiveTripForOffline, useActiveTripOffline } from './activeTripSync'

// Install a fake serviceWorker container with a controller that records
// postMessage calls. Returns the postMessage spy.
function installController() {
  const postMessage = vi.fn()
  const listeners: Record<string, ((e: unknown) => void)[]> = {}
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      controller: { postMessage },
      addEventListener: (t: string, fn: (e: unknown) => void) => {
        ;(listeners[t] ??= []).push(fn)
      },
      removeEventListener: () => {},
    },
  })
  return postMessage
}

function clearServiceWorker() {
  delete (navigator as unknown as Record<string, unknown>).serviceWorker
}

afterEach(() => {
  clearServiceWorker()
  vi.restoreAllMocks()
})

describe('setActiveTripForOffline', () => {
  it('posts the active trip id to the controlling worker', () => {
    const post = installController()
    setActiveTripForOffline('trip-1')
    expect(post).toHaveBeenCalledWith({ type: 'SET_ACTIVE_TRIP', tripId: 'trip-1' })
  })

  it('no-ops when there is no service worker support', () => {
    clearServiceWorker()
    // Must not throw.
    expect(() => setActiveTripForOffline('trip-1')).not.toThrow()
  })

  it('no-ops when there is no controlling worker yet', () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { controller: null, addEventListener: () => {}, removeEventListener: () => {} },
    })
    expect(() => setActiveTripForOffline('trip-1')).not.toThrow()
  })
})

describe('useActiveTripOffline', () => {
  it('registers the trip on mount and clears it on unmount', () => {
    const post = installController()
    const { unmount } = renderHook(() => useActiveTripOffline('trip-9'))
    expect(post).toHaveBeenCalledWith({ type: 'SET_ACTIVE_TRIP', tripId: 'trip-9' })

    post.mockClear()
    unmount()
    expect(post).toHaveBeenCalledWith({ type: 'SET_ACTIVE_TRIP', tripId: null })
  })

  it('does nothing when tripId is null', () => {
    const post = installController()
    renderHook(() => useActiveTripOffline(null))
    expect(post).not.toHaveBeenCalled()
  })
})
