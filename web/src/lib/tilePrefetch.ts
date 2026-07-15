// Pre-fetch OSM map tiles so a trip's maps render offline (part 2 of offline).
//
// offlinePrefetch already caches each trip's data and geocoded stops. This adds
// the map background: it warms the raster tiles around every located stop so the
// service worker's tile cache holds them, and the maps aren't a blank grid when
// there's no connection. The tiles it enumerates (tileMath) match what Leaflet
// requests for the zoom levels the maps actually open at.
//
// Constraints this respects:
//   • It only runs when a service worker controls the page — the SW is what
//     caches the tiles, so without one there is nothing to warm (dev / first
//     load / unsupported browsers just skip).
//   • It is bounded (tileMath caps the tile count) and throttled (a small number
//     of parallel requests), out of respect for OpenStreetMap's tile usage
//     policy, which discourages bulk/aggressive downloading. Warming a few
//     hundred tiles around the user's own itinerary — gently — is a world away
//     from scraping regions.
//   • It is best-effort and silent: a failed tile just isn't cached yet.
//
// Fetches use no-cors so the cross-origin tile responses are retrievable (as
// opaque responses) and pass through the SW, which stores them. That mirrors how
// Leaflet loads tiles via <img>, so the cached entries are exactly reusable.

import type { LatLng } from './api'
import { tileUrl, tilesForPoints } from './tileMath'

// TILE_CONCURRENCY caps parallel tile requests — brisk enough to finish while
// the app is open, gentle enough not to hammer the tile server.
const TILE_CONCURRENCY = 4

// hasServiceWorkerController reports whether a controlling SW exists to cache the
// tiles we fetch. Without one, warming tiles would just spend data for nothing.
function hasServiceWorkerController(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    navigator.serviceWorker.controller != null
  )
}

// prefetchTiles warms the tile cache for the given stops. No-ops when there is
// no controlling service worker or no points. Best-effort and never throws.
export async function prefetchTiles(points: LatLng[], signal?: AbortSignal): Promise<void> {
  if (points.length === 0 || !hasServiceWorkerController()) return
  const tiles = tilesForPoints(points)
  const urls = tiles.map(tileUrl)

  let next = 0
  async function worker(): Promise<void> {
    while (next < urls.length) {
      if (signal?.aborted) return
      const url = urls[next++]
      try {
        // no-cors: we don't need to read the tile, only let the SW cache it (the
        // response is opaque, exactly like Leaflet's <img> tile loads).
        await fetch(url, { mode: 'no-cors', signal })
      } catch {
        // best-effort — an uncached tile just falls back to the network later
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(TILE_CONCURRENCY, urls.length) }, worker))
}
