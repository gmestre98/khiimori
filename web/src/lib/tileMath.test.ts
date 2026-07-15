import { describe, expect, it } from 'vitest'
import { lngLatToTile, tileUrl, tilesForPoints, PREFETCH_ZOOMS } from './tileMath'

describe('lngLatToTile', () => {
  it('maps the origin (0,0) to the centre tile at each zoom', () => {
    expect(lngLatToTile(0, 0, 1)).toEqual({ z: 1, x: 1, y: 1 })
    expect(lngLatToTile(0, 0, 2)).toEqual({ z: 2, x: 2, y: 2 })
  })

  it('returns a tile that geographically contains the coordinate', () => {
    // Verify against the inverse slippy-map transform: the coordinate must fall
    // within the returned tile's lng/lat bounds. (Robust, no hand-computed value.)
    const lng = -9.1393
    const lat = 38.7223
    const z = 12
    const { x, y } = lngLatToTile(lng, lat, z)
    const n = 2 ** z
    const tile2lng = (tx: number) => (tx / n) * 360 - 180
    const tile2lat = (ty: number) => {
      const r = Math.PI - (2 * Math.PI * ty) / n
      return (180 / Math.PI) * Math.atan(Math.sinh(r))
    }
    expect(tile2lng(x)).toBeLessThanOrEqual(lng)
    expect(lng).toBeLessThan(tile2lng(x + 1))
    // Latitude decreases as tile y increases (north is up).
    expect(tile2lat(y)).toBeGreaterThanOrEqual(lat)
    expect(lat).toBeGreaterThan(tile2lat(y + 1))
  })

  it('clamps to the valid tile range at the extremes', () => {
    const z = 3
    const max = 2 ** z - 1
    const north = lngLatToTile(179.9, 85, z)
    expect(north.x).toBeLessThanOrEqual(max)
    expect(north.y).toBeGreaterThanOrEqual(0)
    const south = lngLatToTile(-179.9, -85, z)
    expect(south.x).toBeGreaterThanOrEqual(0)
    expect(south.y).toBeLessThanOrEqual(max)
  })
})

describe('tilesForPoints', () => {
  const lisbon = { lat: 38.7223, lng: -9.1393 }

  it('returns nothing for no points', () => {
    expect(tilesForPoints([])).toEqual([])
  })

  it('covers a 3×3 block at detail zooms and a single tile at overview zooms', () => {
    const tiles = tilesForPoints([lisbon])
    const byZoom = (z: number) => tiles.filter((t) => t.z === z)
    expect(byZoom(6).length).toBe(1) // overview → centre tile only
    expect(byZoom(9).length).toBe(1)
    expect(byZoom(13).length).toBe(9) // detail → 3×3
    expect(byZoom(14).length).toBe(9)
    // Every configured zoom is represented.
    for (const z of PREFETCH_ZOOMS) expect(byZoom(z).length).toBeGreaterThan(0)
  })

  it('deduplicates tiles shared by nearby points', () => {
    const near = { lat: 38.7224, lng: -9.1392 } // same tiles as lisbon
    const one = tilesForPoints([lisbon])
    const two = tilesForPoints([lisbon, near])
    expect(two.length).toBe(one.length) // no new tiles added
  })

  it('never exceeds the tile cap', () => {
    const many = Array.from({ length: 500 }, (_, i) => ({ lat: i * 0.1, lng: i * 0.13 }))
    const tiles = tilesForPoints(many, PREFETCH_ZOOMS, 100)
    expect(tiles.length).toBeLessThanOrEqual(100)
  })
})

describe('tileUrl', () => {
  it('builds the canonical subdomain-less OSM url', () => {
    expect(tileUrl({ z: 12, x: 1954, y: 1507 })).toBe(
      'https://tile.openstreetmap.org/12/1954/1507.png',
    )
  })
})
