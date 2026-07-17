// Tests for the on-device geocode cache (offline location validation).
// fake-indexeddb/auto patches globalThis.indexedDB so resourceCache runs under
// Node/jsdom without a real browser.

import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  normalizeLocation,
  offlineSuggestions,
  readCachedGeocode,
  resolveLocation,
  suggestLocalPlaces,
  warmGeocodeFromWaypoints,
  writeCachedGeocode,
} from './geocodeCache'
import { UnauthorizedError } from './api'
import { cacheKeys } from './cacheKeys'
import { clearCache, writeCache } from './resourceCache'
import type { RegionPlace } from './regionPlaces'
import * as api from './api'

// writeRegionPlaces seeds the shared region index the way warmRegionPlaces would,
// so the geocode fallback can be tested without mocking Overpass.
function writeRegionPlaces(places: RegionPlace[]): Promise<void> {
  return writeCache(cacheKeys.regionPlaces(), places)
}

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

  it('falls back to a pre-loaded trip-region POI when the network fails', async () => {
    // Pre-load a region place the way warmRegionPlaces would.
    await writeRegionPlaces([{ name: 'Louvre', norm: 'louvre', lat: 48.86, lng: 2.33 }])

    geocodeLocation.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const out = await resolveLocation('Louvre')
    expect(out).toEqual({ coords: { lat: 48.86, lng: 2.33 }, source: 'cache' })

    // The region hit is remembered as a plain geocode entry for next time.
    expect(await readCachedGeocode('Louvre')).toEqual({ coords: { lat: 48.86, lng: 2.33 } })
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

describe('offlineSuggestions', () => {
  it('merges past places with pre-loaded region POIs, MRU first, deduped', async () => {
    await writeCachedGeocode('Porto', { lat: 41.1, lng: -8.6 }) // user history
    await writeRegionPlaces([
      { name: 'Porto', norm: 'porto', lat: 41.1, lng: -8.6 }, // dup of history
      { name: 'Porto Cathedral', norm: 'porto cathedral', lat: 41.14, lng: -8.61 },
    ])
    const out = await offlineSuggestions('porto')
    expect(out.map((s) => s.description)).toEqual(['Porto', 'Porto Cathedral'])
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
