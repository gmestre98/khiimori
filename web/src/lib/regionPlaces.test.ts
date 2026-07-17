// Tests for the trip-region offline place index.
// fake-indexeddb/auto backs resourceCache under Node/jsdom.

import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  boundingBox,
  buildOverpassQuery,
  clusterPoints,
  lookupRegionPlace,
  parseOverpass,
  regionsForPoints,
  searchRegionPlaces,
  warmRegionPlaces,
} from './regionPlaces'
import { clearCache } from './resourceCache'

const PARIS = { lat: 48.8566, lng: 2.3522 }
const PORTO = { lat: 41.1579, lng: -8.6291 }

// overpassBody builds a minimal Overpass response with the given named points.
function overpassBody(places: { name: string; lat: number; lng: number; way?: boolean }[]) {
  return {
    elements: places.map((p) =>
      p.way
        ? { type: 'way', tags: { name: p.name }, center: { lat: p.lat, lon: p.lng } }
        : { type: 'node', tags: { name: p.name }, lat: p.lat, lon: p.lng },
    ),
  }
}

beforeEach(() => {
  vi.unstubAllGlobals()
})
afterEach(async () => {
  await clearCache()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('clusterPoints', () => {
  it('groups nearby points and splits far-apart ones', () => {
    const clusters = clusterPoints([PARIS, { lat: 48.86, lng: 2.35 }, PORTO])
    expect(clusters).toHaveLength(2)
    expect(clusters[0]).toHaveLength(2) // the two Paris points
    expect(clusters[1]).toHaveLength(1) // Porto alone
  })
})

describe('boundingBox', () => {
  it('pads around the extent and returns null for no points', () => {
    expect(boundingBox([])).toBeNull()
    const b = boundingBox([PARIS])!
    expect(b.south).toBeLessThan(PARIS.lat)
    expect(b.north).toBeGreaterThan(PARIS.lat)
    expect(b.west).toBeLessThan(PARIS.lng)
    expect(b.east).toBeGreaterThan(PARIS.lng)
  })
})

describe('regionsForPoints', () => {
  it('produces one box per cluster', () => {
    expect(regionsForPoints([PARIS, PORTO])).toHaveLength(2)
    expect(regionsForPoints([])).toEqual([])
  })
})

describe('buildOverpassQuery', () => {
  it('embeds the bbox and caps the result', () => {
    const q = buildOverpassQuery({ south: 1, west: 2, north: 3, east: 4 })
    expect(q).toContain('(1,2,3,4)')
    expect(q).toContain('out center')
    expect(q).toContain('["name"]')
  })
})

describe('parseOverpass', () => {
  it('reads node coords and way centers, dropping the nameless/coordless', () => {
    const parsed = parseOverpass({
      elements: [
        { type: 'node', tags: { name: 'Louvre' }, lat: 48.86, lon: 2.33 },
        { type: 'way', tags: { name: 'Tuileries' }, center: { lat: 48.86, lon: 2.32 } },
        { type: 'node', tags: {}, lat: 1, lon: 1 }, // no name
        { type: 'node', tags: { name: 'Ghost' } }, // no coords
      ],
    })
    expect(parsed.map((p) => p.name)).toEqual(['Louvre', 'Tuileries'])
    expect(parsed[0]).toMatchObject({ norm: 'louvre', lat: 48.86, lng: 2.33 })
  })

  it('is safe on garbage input', () => {
    expect(parseOverpass(null)).toEqual([])
    expect(parseOverpass({})).toEqual([])
  })
})

describe('warmRegionPlaces + lookup/search', () => {
  it('downloads, caches and then resolves places offline', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => overpassBody([{ name: 'Musée du Louvre', ...PARIS }]),
    })
    vi.stubGlobal('fetch', fetchMock)

    await warmRegionPlaces([PARIS])
    expect(fetchMock).toHaveBeenCalledOnce()

    // Exact and fuzzy ("Louvre" ⊂ "Musée du Louvre") both resolve.
    expect(await lookupRegionPlace('Musée du Louvre')).toEqual(PARIS)
    expect(await lookupRegionPlace('Louvre')).toEqual(PARIS)
    expect(await lookupRegionPlace('Somewhere else')).toBeNull()

    expect((await searchRegionPlaces('louvre')).map((s) => s.description)).toEqual([
      'Musée du Louvre',
    ])
  })

  it('prefers the longest (most specific) name on a fuzzy match', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () =>
          overpassBody([
            { name: 'Paris', lat: 48.85, lng: 2.35 },
            { name: 'Paris Plage', lat: 48.86, lng: 2.34 },
          ]),
      }),
    )
    await warmRegionPlaces([PARIS])
    // "Paris Plage" contains "paris" and is longer, so it wins over bare "Paris".
    expect(await lookupRegionPlace('Paris P')).toEqual({ lat: 48.86, lng: 2.34 })
  })

  it('skips entirely when offline', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await warmRegionPlaces([PARIS])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('is best-effort: a failed fetch just caches nothing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await warmRegionPlaces([PARIS])
    expect(await lookupRegionPlace('Louvre')).toBeNull()
  })

  it('merges across warms and dedupes by name', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => overpassBody([{ name: 'Louvre', ...PARIS }]),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => overpassBody([{ name: 'Ribeira', ...PORTO }]),
        }),
    )
    await warmRegionPlaces([PARIS])
    await warmRegionPlaces([PORTO])
    expect(await lookupRegionPlace('Louvre')).toEqual(PARIS)
    expect(await lookupRegionPlace('Ribeira')).toEqual(PORTO)
  })
})
