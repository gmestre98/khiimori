import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Day, Trip, TripsResponse } from './api'

// Mock the network layer and the day-route warmer; keep datesInRange real so the
// prefetch's day enumeration is exercised for real.
vi.mock('./api', async (importActual) => {
  const actual = await importActual<typeof import('./api')>()
  return {
    ...actual,
    fetchTrips: vi.fn(),
    fetchDay: vi.fn(),
    fetchBacklog: vi.fn(),
    fetchBudgetRollup: vi.fn(),
    listCostEntries: vi.fn(),
    fetchJournalEntry: vi.fn(),
  }
})
vi.mock('./dayRouteCache', () => ({ warmDayRoute: vi.fn() }))
vi.mock('./tilePrefetch', () => ({ prefetchTiles: vi.fn() }))
vi.mock('./regionPlaces', () => ({ warmRegionPlaces: vi.fn() }))

import * as api from './api'
import { warmDayRoute } from './dayRouteCache'
import { prefetchTiles } from './tilePrefetch'
import { warmRegionPlaces } from './regionPlaces'
import { prefetchAllTripsForOffline, resetPrefetchForTest } from './offlinePrefetch'

const fetchTrips = vi.mocked(api.fetchTrips)
const fetchDay = vi.mocked(api.fetchDay)
const fetchBacklog = vi.mocked(api.fetchBacklog)
const fetchBudgetRollup = vi.mocked(api.fetchBudgetRollup)
const listCostEntries = vi.mocked(api.listCostEntries)
const fetchJournalEntry = vi.mocked(api.fetchJournalEntry)
const warmDayRouteMock = vi.mocked(warmDayRoute)
const prefetchTilesMock = vi.mocked(prefetchTiles)
const warmRegionPlacesMock = vi.mocked(warmRegionPlaces)

function trip(id: string, start: string, end: string): Trip {
  return {
    id,
    owner_id: 'u',
    name: id,
    destinations: [],
    start_date: start,
    end_date: end,
    base_currency: 'EUR',
    cover: '',
    status: 'upcoming',
    created_at: '',
    updated_at: '',
    is_current: false,
  }
}

function emptyTrips(): TripsResponse {
  return { current: [], upcoming: [], past: [] }
}

function day(id: string, date: string): Day {
  return { id, trip_id: 't1', date, index: 0, notes: '', stays: [], plan_items: [] }
}

function setConnection(value: unknown): void {
  Object.defineProperty(navigator, 'connection', { configurable: true, value })
}
function setOnline(value: boolean): void {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value })
}

beforeEach(() => {
  resetPrefetchForTest()
  vi.clearAllMocks()
  setOnline(true)
  setConnection(undefined)
  fetchDay.mockImplementation((_t, d) => Promise.resolve(day(`day-${d}`, d)))
  fetchBacklog.mockResolvedValue([])
  fetchBudgetRollup.mockResolvedValue({
    trip_total: 0,
    by_category: {},
    by_day: {},
    by_day_category: {},
    planned_trip_total: 0,
    planned_by_category: {},
    planned_by_day: {},
  })
  listCostEntries.mockResolvedValue([])
  fetchJournalEntry.mockResolvedValue({
    id: 'j',
    day_id: 'd',
    author_id: 'a',
    body: '',
    rating: null,
    weather: '',
    mood: '',
    created_at: '',
    updated_at: '',
  })
  warmDayRouteMock.mockResolvedValue([])
  prefetchTilesMock.mockResolvedValue(undefined)
  warmRegionPlacesMock.mockResolvedValue(undefined)
})

afterEach(() => {
  setConnection(undefined)
  setOnline(true)
})

describe('prefetchAllTripsForOffline', () => {
  it('pre-warms every trip and each of its days', async () => {
    fetchTrips.mockResolvedValue({
      ...emptyTrips(),
      current: [trip('t1', '2026-07-01', '2026-07-03')], // 3 days
      past: [trip('t2', '2026-05-10', '2026-05-10')], // 1 day
    })

    await prefetchAllTripsForOffline()

    expect(fetchTrips).toHaveBeenCalledTimes(1)
    // Per-trip cross-cutting reads: 2 trips × (backlog, budget, costs).
    expect(fetchBacklog).toHaveBeenCalledTimes(2)
    expect(fetchBudgetRollup).toHaveBeenCalledTimes(2)
    expect(listCostEntries).toHaveBeenCalledTimes(2)
    // Per-day reads: 3 + 1 = 4 days.
    expect(fetchDay).toHaveBeenCalledTimes(4)
    expect(warmDayRouteMock).toHaveBeenCalledTimes(4)
  })

  it('warms map tiles with the geocoded waypoints from every day', async () => {
    fetchTrips.mockResolvedValue({
      ...emptyTrips(),
      current: [trip('t1', '2026-07-01', '2026-07-02')], // 2 days
    })
    warmDayRouteMock.mockResolvedValue([{ lat: 38.7, lng: -9.1 }])

    await prefetchAllTripsForOffline()

    expect(prefetchTilesMock).toHaveBeenCalledTimes(1)
    const [points] = prefetchTilesMock.mock.calls[0]
    // One waypoint per day × 2 days = 2 points collected.
    expect(points).toHaveLength(2)
    // The same stops feed the region-place pre-load.
    expect(warmRegionPlacesMock).toHaveBeenCalledTimes(1)
    expect(warmRegionPlacesMock.mock.calls[0][0]).toHaveLength(2)
  })

  it('runs only once per session', async () => {
    fetchTrips.mockResolvedValue({
      ...emptyTrips(),
      current: [trip('t1', '2026-07-01', '2026-07-01')],
    })
    await prefetchAllTripsForOffline()
    await prefetchAllTripsForOffline()
    expect(fetchTrips).toHaveBeenCalledTimes(1)
  })

  it('skips entirely when offline', async () => {
    setOnline(false)
    await prefetchAllTripsForOffline()
    expect(fetchTrips).not.toHaveBeenCalled()
  })

  it('skips on a Save-Data connection', async () => {
    setConnection({ saveData: true })
    await prefetchAllTripsForOffline()
    expect(fetchTrips).not.toHaveBeenCalled()
  })

  it('skips on a 2G connection', async () => {
    setConnection({ effectiveType: '2g' })
    await prefetchAllTripsForOffline()
    expect(fetchTrips).not.toHaveBeenCalled()
  })

  it('does not throw when a day fetch fails', async () => {
    fetchTrips.mockResolvedValue({
      ...emptyTrips(),
      current: [trip('t1', '2026-07-01', '2026-07-02')],
    })
    fetchDay.mockRejectedValue(new Error('boom'))
    await expect(prefetchAllTripsForOffline()).resolves.toBeUndefined()
  })

  it('does not throw when the trips listing itself fails', async () => {
    fetchTrips.mockRejectedValue(new Error('offline'))
    await expect(prefetchAllTripsForOffline()).resolves.toBeUndefined()
  })
})
