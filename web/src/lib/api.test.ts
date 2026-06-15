import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiFetch, setUnauthorizedHandler } from './api'

afterEach(() => {
  setUnauthorizedHandler(null)
  vi.restoreAllMocks()
})

describe('apiFetch 401 interceptor', () => {
  it('sends credentials and invokes the unauthorized handler on 401', async () => {
    const onUnauthorized = vi.fn()
    setUnauthorizedHandler(onUnauthorized)
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('', { status: 401 }))

    await apiFetch('/me')

    expect(onUnauthorized).toHaveBeenCalledOnce()
    expect(fetchSpy.mock.calls[0][1]?.credentials).toBe('include')
  })

  it('does not invoke the handler on a 2xx response', async () => {
    const onUnauthorized = vi.fn()
    setUnauthorizedHandler(onUnauthorized)
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }))

    await apiFetch('/me')

    expect(onUnauthorized).not.toHaveBeenCalled()
  })

  it('does not invoke the handler on a non-401 error response', async () => {
    const onUnauthorized = vi.fn()
    setUnauthorizedHandler(onUnauthorized)
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 500 }))

    await apiFetch('/me')

    expect(onUnauthorized).not.toHaveBeenCalled()
  })
})
