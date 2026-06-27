import { afterEach, describe, expect, it, vi } from 'vitest'
import { registerServiceWorker } from './registerSW'

// Helper: install (or remove) a fake serviceWorker container on navigator.
function setServiceWorker(value: unknown) {
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value,
  })
}

function clearServiceWorker() {
  // delete the own property so 'serviceWorker' in navigator is false
  delete (navigator as unknown as Record<string, unknown>).serviceWorker
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  clearServiceWorker()
})

describe('registerServiceWorker', () => {
  it('no-ops in development without touching navigator', async () => {
    // Default test env is not PROD.
    const register = vi.fn()
    setServiceWorker({ register })
    expect(await registerServiceWorker()).toBeNull()
    expect(register).not.toHaveBeenCalled()
  })

  it('registers /sw.js at scope / in a production build', async () => {
    vi.stubEnv('PROD', true)
    const register = vi.fn().mockResolvedValue('reg')
    setServiceWorker({ register })
    expect(await registerServiceWorker()).toBe('reg')
    expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/' })
  })

  it('returns null when the browser lacks service-worker support', async () => {
    vi.stubEnv('PROD', true)
    clearServiceWorker()
    expect(await registerServiceWorker()).toBeNull()
  })

  it('swallows and logs a failed registration so boot is never broken', async () => {
    vi.stubEnv('PROD', true)
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    setServiceWorker({ register: vi.fn().mockRejectedValue(new Error('nope')) })
    expect(await registerServiceWorker()).toBeNull()
    expect(error).toHaveBeenCalled()
  })
})
