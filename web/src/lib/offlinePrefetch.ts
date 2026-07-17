// Launch-time offline pre-warm: make ALL trips available offline.
//
// The app's offline reads are served by the service worker's data cache, which
// only holds what has actually been fetched. Left alone, that means a trip is
// only usable offline after you've opened it online first. This module closes
// that gap: right after sign-in it walks every trip the user has and fetches
// each read once, so the service worker caches them and an offline start finds
// the whole itinerary — days, plans, budget, journal — already there. It also
// pre-geocodes each day's stops (dayRouteCache) so the maps have their pins.
//
// It is deliberately best-effort and low-priority:
//   • runs once per app session, in the background, never blocking render;
//   • skips entirely when offline or on a metered/Save-Data connection, so it
//     never spends the user's mobile data unasked;
//   • fetches with bounded concurrency so it doesn't stampede the API (which
//     scales to zero) or the device;
//   • swallows every error — a failed pre-warm just means that read isn't cached
//     yet, which is exactly the state we started from.
//
// Data volume is small: trip JSON is tens of KB per trip, so pre-warming the
// whole history costs a few MB of cache at most (photos are excluded). After the
// data it also warms the map tiles around every stop (tilePrefetch) — bounded
// and throttled — so the maps have their background offline too.

import {
  datesInRange,
  fetchBacklog,
  fetchBudgetRollup,
  fetchDay,
  fetchJournalEntry,
  fetchTrips,
  listCostEntries,
  type LatLng,
  type Trip,
} from './api'
import { collectLocations } from '../trips/locatedItems'
import { warmDayRoute } from './dayRouteCache'
import { warmRegionPlaces } from './regionPlaces'
import { prefetchTiles } from './tilePrefetch'

// CONCURRENCY caps how many pre-warm fetches are in flight at once — enough to
// finish promptly, low enough not to stampede a cold-starting backend.
const CONCURRENCY = 4

// hasRun guards against a second pass in the same session (e.g. a re-render or a
// second sign-in event). Pre-warming once per launch is plenty.
let hasRun = false

// shouldSkip reports when pre-warming would be wasteful or unwelcome: offline
// (nothing to fetch), or a connection the user would rather we didn't spend
// (Save-Data on, or a 2G-class link). Reads the optional Network Information API
// defensively — it isn't available everywhere.
function shouldSkip(): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  const conn = (
    navigator as unknown as {
      connection?: { saveData?: boolean; effectiveType?: string }
    }
  ).connection
  if (conn?.saveData) return true
  if (conn?.effectiveType && /(^|-)2g$/.test(conn.effectiveType)) return true
  return false
}

// runPool runs `task` over `items` with at most CONCURRENCY in flight, resolving
// once all have settled. Errors are contained per-item by the callers (each task
// swallows its own), so the pool never rejects.
async function runPool<T>(items: T[], task: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++
      await task(items[i])
    }
  }
  const workers = Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker)
  await Promise.all(workers)
}

// swallow runs a fetch and discards its result and any error. Pre-warming is
// best-effort: a failure just leaves that read uncached.
async function swallow(p: Promise<unknown>): Promise<void> {
  try {
    await p
  } catch {
    // best-effort — see module comment
  }
}

// prewarmDay fetches one day and pre-geocodes its stops so the day screen and
// the maps work offline. Returns the day's geocoded waypoints (for the tile
// pre-fetch), or [] when it has none / couldn't load. Failures are swallowed.
async function prewarmDay(trip: Trip, date: string, signal?: AbortSignal): Promise<LatLng[]> {
  try {
    const day = await fetchDay(trip.id, date, signal)
    // Journal text (when the day has an entry) — 404s for empty days are fine.
    await swallow(fetchJournalEntry(trip.id, day.id, signal))
    // Pre-geocode the day's stops so the maps have their pins offline.
    // warmDayRoute is itself best-effort (swallows its own failures).
    return await warmDayRoute(trip.id, date, collectLocations(day), signal)
  } catch {
    // couldn't load the day — nothing to pre-warm for it
    return []
  }
}

// prewarmTrip fetches a trip's cross-cutting reads (backlog, budget, expenses)
// and every one of its days, accumulating the geocoded waypoints so the caller
// can warm their map tiles.
async function prewarmTrip(trip: Trip, signal?: AbortSignal): Promise<LatLng[]> {
  await Promise.all([
    swallow(fetchBacklog(trip.id, signal)),
    swallow(fetchBudgetRollup(trip.id, signal)),
    swallow(listCostEntries(trip.id, signal)),
  ])
  const dates = datesInRange(trip.start_date, trip.end_date)
  const points: LatLng[] = []
  await runPool(dates, async (date) => {
    points.push(...(await prewarmDay(trip, date, signal)))
  })
  return points
}

// prefetchAllTripsForOffline pre-warms every trip's data for offline use, then
// warms the map tiles around all of their stops. Call it once the user is
// authenticated; it self-limits to a single run per session and returns
// immediately (doing its work in the background) when it should skip. Never throws.
export async function prefetchAllTripsForOffline(signal?: AbortSignal): Promise<void> {
  if (hasRun || shouldSkip()) return
  hasRun = true
  try {
    const trips = await fetchTrips(signal)
    const all = [...trips.current, ...trips.upcoming, ...trips.past]
    const points: LatLng[] = []
    // One trip at a time (each trip already fans its days out to CONCURRENCY),
    // so we don't multiply the in-flight count across trips.
    for (const trip of all) {
      if (signal?.aborted) return
      points.push(...(await prewarmTrip(trip, signal)))
    }
    // Data is cached; now warm the map tiles around every stop (best-effort,
    // bounded/throttled, and a no-op without a controlling service worker).
    if (signal?.aborted) return
    await prefetchTiles(points, signal)
    // Finally, pre-load named POIs around every stop so a new place typed near a
    // trip can validate + autocomplete offline (best-effort, bounded, silent).
    if (signal?.aborted) return
    await warmRegionPlaces(points, signal)
  } catch {
    // Couldn't even list trips (offline / transient) — nothing to pre-warm.
  }
}

// resetPrefetchForTest clears the once-per-session guard so tests can drive the
// prefetch repeatedly. Not used in production code.
export function resetPrefetchForTest(): void {
  hasRun = false
}
