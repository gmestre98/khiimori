// Offline-capable day-route waypoints (map pins for all trips).
//
// The maps geocode a day's stops through POST /geo/day-route. Being a POST, the
// service worker can't cache it, so offline the maps would have no pin
// coordinates — a blank map. This helper wraps fetchDayRoute with a
// network-first, write-through app-side cache (resourceCache) keyed by trip+date
// so the last-known waypoints render offline, and are pre-warmed for every trip
// on launch (offlinePrefetch.ts).
//
// The cached entry stores the exact ordered locations that produced the
// waypoints. On an offline read we only trust the cache when those locations
// still match the day's current stops, because waypoints line up positionally
// with the located items (waypoints[i] ↔ locatedItems[i]) — serving waypoints
// from a different set of stops would mis-place pins.

import { fetchDayRoute, type LatLng } from './api'
import { cacheKeys } from './cacheKeys'
import { readCache, writeCache } from './resourceCache'

// CachedDayRoute is what we persist: the waypoints plus the locations they were
// geocoded from, so a later read can detect a stale (different-stops) entry.
interface CachedDayRoute {
  locations: string[]
  waypoints: LatLng[]
}

// sameLocations reports whether two ordered location lists are identical, so a
// cached route is only reused when the day's stops haven't changed.
function sameLocations(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i])
}

// loadDayRoute returns the day's geocoded waypoints, network-first with an
// offline fallback to the last-known cached waypoints for the same stops.
//
// Online: fetch fresh, persist, return. Offline (or any fetch failure): fall
// back to the cached waypoints when they were geocoded from the same locations,
// otherwise rethrow so the caller shows its normal "couldn't load" state.
export async function loadDayRoute(
  tripId: string,
  date: string,
  locations: string[],
  signal?: AbortSignal,
): Promise<LatLng[]> {
  const key = cacheKeys.dayRoute(tripId, date)
  try {
    const { waypoints } = await fetchDayRoute(locations, signal)
    void writeCache(key, { locations, waypoints } satisfies CachedDayRoute)
    return waypoints
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    const cached = await readCache<CachedDayRoute>(key)
    if (cached && sameLocations(cached.data.locations, locations)) {
      return cached.data.waypoints
    }
    throw err
  }
}

// warmDayRoute pre-fetches and caches a day's waypoints without needing the
// result — used by the launch prefetch so the maps have pins offline before the
// user ever opens them. Best-effort: swallows failures (offline, no stops).
// Returns the waypoints on success (the tile prefetch uses them), or [] on
// failure or when there is nothing to geocode.
export async function warmDayRoute(
  tripId: string,
  date: string,
  locations: string[],
  signal?: AbortSignal,
): Promise<LatLng[]> {
  if (locations.length === 0) return []
  try {
    return await loadDayRoute(tripId, date, locations, signal)
  } catch {
    return []
  }
}
