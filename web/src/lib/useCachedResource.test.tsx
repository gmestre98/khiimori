// Tests for the stale-while-revalidate hook (M11.1 S1).
// resourceCache is mocked so each test controls cache hits/misses precisely and
// asserts the SWR ordering (cached render first, fresh render second).

import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { cleanup, renderHook, waitFor, act } from '@testing-library/react'
import { useCachedResource } from './useCachedResource'

const readCache = vi.fn()
const writeCache = vi.fn()
vi.mock('./resourceCache', () => ({
  readCache: (...a: unknown[]) => readCache(...a),
  writeCache: (...a: unknown[]) => writeCache(...a),
  // clearCache is called by the global test setup's afterEach; provide a no-op
  // so this file's mock satisfies that import.
  clearCache: () => Promise.resolve(),
}))

beforeEach(() => {
  readCache.mockReset().mockResolvedValue(null)
  writeCache.mockReset().mockResolvedValue(undefined)
})
afterEach(cleanup)

// deferred builds a promise whose resolve/reject we control, to freeze the
// fetch mid-flight and assert intermediate (cached) state.
function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('useCachedResource', () => {
  it('renders cached data before the fetch resolves, then swaps in fresh data', async () => {
    readCache.mockResolvedValue({ data: 'cached', cachedAt: 1 })
    const d = deferred<string>()
    const { result } = renderHook(() => useCachedResource('k', () => d.promise))

    // First: cached value on screen, marked fromCache, still validating.
    await waitFor(() => expect(result.current.data).toBe('cached'))
    expect(result.current.fromCache).toBe(true)
    expect(result.current.isValidating).toBe(true)
    expect(result.current.error).toBeNull()

    // Then: fresh value replaces it and validation ends; cache is written.
    await act(async () => {
      d.resolve('fresh')
      await d.promise
    })
    await waitFor(() => expect(result.current.data).toBe('fresh'))
    expect(result.current.fromCache).toBe(false)
    expect(result.current.isValidating).toBe(false)
    expect(writeCache).toHaveBeenCalledWith('k', 'fresh')
  })

  it('with no cache, resolves to fresh data', async () => {
    readCache.mockResolvedValue(null)
    const { result } = renderHook(() => useCachedResource('k', () => Promise.resolve('fresh')))

    await waitFor(() => expect(result.current.data).toBe('fresh'))
    expect(result.current.fromCache).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('keeps cached data and surfaces no error when the fetch fails', async () => {
    readCache.mockResolvedValue({ data: 'cached', cachedAt: 1 })
    const d = deferred<string>()
    const { result } = renderHook(() => useCachedResource('k', () => d.promise))

    // Cached value shows first while validating.
    await waitFor(() => expect(result.current.data).toBe('cached'))
    expect(result.current.isValidating).toBe(true)

    // The background fetch fails: cached data stays, no error, validation ends.
    await act(async () => {
      d.reject(new Error('offline'))
      await d.promise.catch(() => {})
    })
    await waitFor(() => expect(result.current.isValidating).toBe(false))
    expect(result.current.data).toBe('cached')
    expect(result.current.error).toBeNull()
    expect(writeCache).not.toHaveBeenCalled()
  })

  it('surfaces an error when the fetch fails and there is no cache', async () => {
    readCache.mockResolvedValue(null)
    const { result } = renderHook(() =>
      useCachedResource('k', () => Promise.reject(new Error('boom'))),
    )

    await waitFor(() => expect(result.current.error).not.toBeNull())
    expect(result.current.error?.message).toBe('boom')
    expect(result.current.data).toBeNull()
  })

  it('stays idle when the key is null', async () => {
    const fetcher = vi.fn().mockResolvedValue('x')
    const { result } = renderHook(() => useCachedResource(null, fetcher))

    // Give any (unwanted) async work a chance to run.
    await Promise.resolve()
    expect(fetcher).not.toHaveBeenCalled()
    expect(result.current.data).toBeNull()
    expect(result.current.isValidating).toBe(false)
  })

  it('refresh() re-runs the fetcher', async () => {
    readCache.mockResolvedValue(null)
    const fetcher = vi.fn().mockResolvedValue('v1')
    const { result } = renderHook(() => useCachedResource('k', fetcher))

    await waitFor(() => expect(result.current.data).toBe('v1'))
    fetcher.mockResolvedValue('v2')
    act(() => result.current.refresh())
    await waitFor(() => expect(result.current.data).toBe('v2'))
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})
