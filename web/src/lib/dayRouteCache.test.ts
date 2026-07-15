import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadDayRoute, warmDayRoute } from './dayRouteCache'
import { clearCache } from './resourceCache'
import * as api from './api'

vi.mock('./api', () => ({
  fetchDayRoute: vi.fn(),
}))

const fetchDayRoute = vi.mocked(api.fetchDayRoute)

const TRIP = 'trip-1'
const DATE = '2026-07-15'
const LOCS = ['Lisbon', 'Porto']
const WPS = [
  { lat: 38.7, lng: -9.1 },
  { lat: 41.1, lng: -8.6 },
]

afterEach(async () => {
  await clearCache()
})
beforeEach(() => {
  fetchDayRoute.mockReset()
})

describe('loadDayRoute', () => {
  it('returns fresh waypoints online and caches them', async () => {
    fetchDayRoute.mockResolvedValueOnce({ waypoints: WPS })
    const out = await loadDayRoute(TRIP, DATE, LOCS)
    expect(out).toEqual(WPS)
    expect(fetchDayRoute).toHaveBeenCalledWith(LOCS, undefined)
  })

  it('falls back to cached waypoints when offline and the stops are unchanged', async () => {
    fetchDayRoute.mockResolvedValueOnce({ waypoints: WPS })
    await loadDayRoute(TRIP, DATE, LOCS) // seed the cache

    fetchDayRoute.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const out = await loadDayRoute(TRIP, DATE, LOCS)
    expect(out).toEqual(WPS)
  })

  it('rethrows when offline and the day has different stops than the cache', async () => {
    fetchDayRoute.mockResolvedValueOnce({ waypoints: WPS })
    await loadDayRoute(TRIP, DATE, LOCS) // cached for [Lisbon, Porto]

    fetchDayRoute.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(loadDayRoute(TRIP, DATE, ['Madrid'])).rejects.toThrow()
  })

  it('does not fall back on an abort (caller is cancelling)', async () => {
    fetchDayRoute.mockResolvedValueOnce({ waypoints: WPS })
    await loadDayRoute(TRIP, DATE, LOCS)

    fetchDayRoute.mockRejectedValueOnce(new DOMException('aborted', 'AbortError'))
    await expect(loadDayRoute(TRIP, DATE, LOCS)).rejects.toThrow(DOMException)
  })
})

describe('warmDayRoute', () => {
  it('does not fetch when there are no stops', async () => {
    const out = await warmDayRoute(TRIP, DATE, [])
    expect(out).toEqual([])
    expect(fetchDayRoute).not.toHaveBeenCalled()
  })

  it('swallows failures and returns an empty list', async () => {
    fetchDayRoute.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const out = await warmDayRoute(TRIP, DATE, LOCS)
    expect(out).toEqual([])
  })

  it('returns and caches waypoints on success', async () => {
    fetchDayRoute.mockResolvedValueOnce({ waypoints: WPS })
    const out = await warmDayRoute(TRIP, DATE, LOCS)
    expect(out).toEqual(WPS)

    // Cached: an offline read now returns them without a fetch.
    fetchDayRoute.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    expect(await loadDayRoute(TRIP, DATE, LOCS)).toEqual(WPS)
  })
})
