import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { prefetchTiles } from './tilePrefetch'
import { tilesForPoints } from './tileMath'

const lisbon = { lat: 38.7223, lng: -9.1393 }

function setController(present: boolean): void {
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { controller: present ? {} : null },
  })
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(null, { status: 200 }))),
  )
  setController(true)
})

afterEach(() => {
  vi.unstubAllGlobals()
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: undefined })
})

describe('prefetchTiles', () => {
  it('fetches one no-cors request per enumerated tile', async () => {
    await prefetchTiles([lisbon])
    const expected = tilesForPoints([lisbon]).length
    const fetchMock = vi.mocked(fetch)
    expect(fetchMock).toHaveBeenCalledTimes(expected)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/^https:\/\/tile\.openstreetmap\.org\/\d+\/\d+\/\d+\.png$/)
    expect(init).toMatchObject({ mode: 'no-cors' })
  })

  it('does nothing without a controlling service worker', async () => {
    setController(false)
    await prefetchTiles([lisbon])
    expect(fetch).not.toHaveBeenCalled()
  })

  it('does nothing for an empty point list', async () => {
    await prefetchTiles([])
    expect(fetch).not.toHaveBeenCalled()
  })

  it('swallows fetch failures', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('network'))
    await expect(prefetchTiles([lisbon])).resolves.toBeUndefined()
  })

  it('stops early once aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    await prefetchTiles([lisbon], controller.signal)
    expect(fetch).not.toHaveBeenCalled()
  })
})
