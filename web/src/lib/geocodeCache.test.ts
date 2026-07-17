// Tests for the on-device geocode cache (offline location validation).
// fake-indexeddb/auto patches globalThis.indexedDB so resourceCache runs under
// Node/jsdom without a real browser.

import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  normalizeLocation,
  readCachedGeocode,
  resolveLocation,
  suggestLocalPlaces,
  warmGeocodeFromWaypoints,
  writeCachedGeocode,
} from './geocodeCache'
import { UnauthorizedError } from './api'
import { clearCache } from './resourceCache'
import * as api from './api'

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api')
  return { ...actual, geocodeLocation: vi.fn() }
})

const geocodeLocation = vi.mocked(api.geocodeLocation)

const PARIS = { lat: 48.8566, lng: 2.3522 }

beforeEach(() => {
  geocodeLocation.mockReset()
})
afterEach(async () => {
  await clearCache()
})

describe('normalizeLocation', () => {
  it('trims, collapses whitespace and lower-cases', () => {
    expect(normalizeLocation('  Louvre,   Paris ')).toBe('louvre, paris')
  })
})

describe('resolveLocation', () => {
  it('geocodes online and writes the result through to the cache', async () => {
    geocodeLocation.mockResolvedValueOnce(PARIS)
    const out = await resolveLocation('Louvre, Paris')
    expect(out).toEqual({ coords: PARIS, source: 'live' })
    expect(await readCachedGeocode('louvre, paris')).toEqual({ coords: PARIS })
  })

  it('records a not-a-place (null) result too', async () => {
    geocodeLocation.mockResolvedValueOnce(null)
    const out = await resolveLocation('asdfqwer')
    expect(out).toEqual({ coords: null, source: 'live' })
    expect(await readCachedGeocode('asdfqwer')).toEqual({ coords: null })
  })

  it('falls back to the cached result when the network fails', async () => {
    geocodeLocation.mockResolvedValueOnce(PARIS)
    await resolveLocation('Louvre, Paris') // seed

    geocodeLocation.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const out = await resolveLocation('Louvre, Paris')
    expect(out).toEqual({ coords: PARIS, source: 'cache' })
  })

  it('rethrows when the network fails and nothing is cached', async () => {
    geocodeLocation.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(resolveLocation('Somewhere New')).rejects.toThrow('Failed to fetch')
  })

  it('rethrows auth failures instead of masking them with a stale hit', async () => {
    geocodeLocation.mockResolvedValueOnce(PARIS)
    await resolveLocation('Louvre, Paris') // seed a hit

    geocodeLocation.mockRejectedValueOnce(new UnauthorizedError())
    await expect(resolveLocation('Louvre, Paris')).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it('propagates aborts', async () => {
    const err = new DOMException('aborted', 'AbortError')
    geocodeLocation.mockRejectedValueOnce(err)
    await expect(resolveLocation('Louvre, Paris')).rejects.toBe(err)
  })
})

describe('suggestLocalPlaces', () => {
  it('matches indexed places by substring, most-recent first', async () => {
    await writeCachedGeocode('Louvre, Paris', PARIS)
    await writeCachedGeocode('Porto', { lat: 41.1, lng: -8.6 })
    await writeCachedGeocode('Paris Airport', { lat: 49, lng: 2.5 })

    const out = await suggestLocalPlaces('paris')
    expect(out.map((s) => s.description)).toEqual(['Paris Airport', 'Louvre, Paris'])
  })

  it('does not index not-a-place results', async () => {
    await writeCachedGeocode('nowhere', null)
    expect(await suggestLocalPlaces('nowhere')).toEqual([])
  })

  it('dedupes on re-write and moves the entry to the front', async () => {
    await writeCachedGeocode('Paris', PARIS)
    await writeCachedGeocode('Paris Airport', { lat: 49, lng: 2.5 })
    await writeCachedGeocode('Paris', PARIS) // touch again → back to front

    const out = await suggestLocalPlaces('paris')
    expect(out.map((s) => s.description)).toEqual(['Paris', 'Paris Airport'])
  })
})

describe('warmGeocodeFromWaypoints', () => {
  it('caches each stop when every location resolved', async () => {
    await warmGeocodeFromWaypoints(
      ['Lisbon', 'Porto'],
      [
        { lat: 38.7, lng: -9.1 },
        { lat: 41.1, lng: -8.6 },
      ],
    )
    expect(await readCachedGeocode('Lisbon')).toEqual({ coords: { lat: 38.7, lng: -9.1 } })
    expect(await readCachedGeocode('Porto')).toEqual({ coords: { lat: 41.1, lng: -8.6 } })
  })

  it('adds every warmed stop to the offline autocomplete index', async () => {
    await warmGeocodeFromWaypoints(
      ['Lisbon', 'Porto', 'Braga'],
      [
        { lat: 38.7, lng: -9.1 },
        { lat: 41.1, lng: -8.6 },
        { lat: 41.5, lng: -8.4 },
      ],
    )
    // All three must survive the shared-index read-modify-write, not just one.
    expect((await suggestLocalPlaces('lisbon')).map((s) => s.description)).toEqual(['Lisbon'])
    expect((await suggestLocalPlaces('porto')).map((s) => s.description)).toEqual(['Porto'])
    expect((await suggestLocalPlaces('braga')).map((s) => s.description)).toEqual(['Braga'])
  })

  it('skips when lengths differ (some stops were dropped by the server)', async () => {
    await warmGeocodeFromWaypoints(['Lisbon', 'Porto'], [{ lat: 38.7, lng: -9.1 }])
    expect(await readCachedGeocode('Lisbon')).toBeNull()
  })
})
