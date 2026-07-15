// Slippy-map tile math for offline tile pre-caching.
//
// The maps render OpenStreetMap raster tiles (the `{z}/{x}/{y}.png` scheme). To
// make a trip's maps usable offline we pre-fetch the tiles that cover its stops
// so the service worker can cache them (see tilePrefetch + sw.js). These are the
// pure geometry helpers for that: converting a coordinate to the tile that
// contains it at a given zoom, and enumerating a bounded set of tiles around a
// set of stops.
//
// Kept dependency-free and side-effect-free (PRD §7.0) so it is trivially
// testable and reusable by both the app and the (worker-side) cache key logic.

import type { LatLng } from './api'

// TileCoord identifies one raster tile in the slippy-map scheme.
export interface TileCoord {
  z: number
  x: number
  y: number
}

// TILE_HOST is the OSM tile host (subdomain-less form, which the server also
// serves). The cache is subdomain-agnostic (sw.js normalises a/b/c to this), so
// pre-fetching one canonical host warms the tiles Leaflet later requests via any
// subdomain.
export const TILE_HOST = 'tile.openstreetmap.org'

// PREFETCH_ZOOMS is the set of zoom levels warmed around each stop. The two low
// levels give an at-a-glance overview (and dedupe heavily — neighbouring stops
// share overview tiles); the higher levels cover the street-level detail the day
// and trip maps actually open at (single stop → ~z14, multi-stop → fit-bounds).
export const PREFETCH_ZOOMS = [6, 9, 11, 12, 13, 14] as const

// detailRadius is how many tiles out from the centre tile to include at a given
// zoom. Overview levels take just the centre tile; street levels take a 3×3 block
// so a small pan around the stop stays covered.
function detailRadius(z: number): number {
  return z >= 11 ? 1 : 0
}

// MAX_TILES caps the total number of tiles a single pre-fetch will enumerate, so
// a trip with many stops can't queue an unbounded download. At ~20 KB/tile this
// bounds the tile cache to roughly 30–40 MB. Reaching the cap simply means the
// furthest-down-the-list stops rely on opportunistic caching (viewed-while-online)
// instead of pre-fetch.
export const MAX_TILES = 2000

// lngLatToTile returns the tile x/y that contains the given coordinate at zoom
// `z`, per the standard Web-Mercator slippy-map formulas. x/y are clamped to the
// valid [0, 2^z − 1] range so a coordinate at the antimeridian/poles can't
// produce an out-of-range tile.
export function lngLatToTile(lng: number, lat: number, z: number): TileCoord {
  const n = 2 ** z
  const latRad = (lat * Math.PI) / 180
  const x = Math.floor(((lng + 180) / 360) * n)
  const y = Math.floor(((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2) * n)
  const clamp = (v: number) => Math.max(0, Math.min(n - 1, v))
  return { z, x: clamp(x), y: clamp(y) }
}

// tilesForPoints enumerates the deduplicated set of tiles covering a buffer
// around every point, across PREFETCH_ZOOMS, capped at MAX_TILES. Points are
// processed in order, so if the cap is hit the earliest stops are fully covered
// (the map fits to all stops, but the earliest ones are the most likely to be
// opened first). Returns an empty array when there are no points.
export function tilesForPoints(
  points: LatLng[],
  zooms: readonly number[] = PREFETCH_ZOOMS,
  maxTiles: number = MAX_TILES,
): TileCoord[] {
  const seen = new Set<string>()
  const out: TileCoord[] = []
  const add = (t: TileCoord): boolean => {
    const key = `${t.z}/${t.x}/${t.y}`
    if (seen.has(key)) return true
    seen.add(key)
    out.push(t)
    return out.length < maxTiles
  }

  for (const p of points) {
    for (const z of zooms) {
      const c = lngLatToTile(p.lng, p.lat, z)
      const r = detailRadius(z)
      const max = 2 ** z - 1
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          const x = c.x + dx
          const y = c.y + dy
          // Skip wrapped/out-of-range neighbours rather than clamping, so an edge
          // stop doesn't pile duplicate work onto the boundary tile.
          if (x < 0 || y < 0 || x > max || y > max) continue
          if (!add({ z, x, y })) return out
        }
      }
    }
  }
  return out
}

// tileUrl builds the canonical (subdomain-less) OSM URL for a tile. Used by the
// pre-fetcher; the service worker caches it under a subdomain-normalised key so
// Leaflet's later a/b/c-subdomain requests hit the same entry.
export function tileUrl(t: TileCoord): string {
  return `https://${TILE_HOST}/${t.z}/${t.x}/${t.y}.png`
}
