// Trip cover images: where to load them from, and loading them first.
//
// The API serves an uploaded cover at a stable path relative to the API base
// (/trips/{id}/cover/{version}); it only changes when the cover does, so the
// browser and the service worker keep it. External cover URLs pass through.
//
// Covers are the first thing on screen but are drawn as CSS backgrounds, which
// browsers fetch late and at low priority. preloadCovers starts them straight
// away at high priority — from the trips list saved on the device, before the
// first screen renders — so they're ready (or already cached) when the hero
// and the trip list paint.

import { apiUrl, type Trip, type TripsResponse } from './api'
import { readCache } from './resourceCache'
import { cacheKeys } from './cacheKeys'

// coverSrc returns the loadable URL of a trip's cover, or '' when it has none.
export function coverSrc(trip: Pick<Trip, 'cover' | 'cover_url'>): string {
  const u = trip.cover_url || trip.cover || ''
  if (u.startsWith('/trips/')) return apiUrl(u)
  if (u.startsWith('gs://')) return '' // a raw storage reference isn't loadable
  return u
}

const started = new Set<string>()
// Keep the Image objects so the decoded images stay in memory.
const keep: HTMLImageElement[] = []

// orderForScreen puts the covers people see first at the front: the current
// trip, then upcoming trips, then past ones (the order the API groups them).
function orderForScreen(trips: TripsResponse | Trip[]): Trip[] {
  if (Array.isArray(trips)) return trips
  return [...(trips.current ?? []), ...(trips.upcoming ?? []), ...(trips.past ?? [])]
}

// HIGH_PRIORITY_COUNT covers get fetchpriority=high (what's on the first
// screen); the rest still start now, at normal priority.
const HIGH_PRIORITY_COUNT = 4

// preloadCovers starts loading every trip's cover once per session.
export function preloadCovers(trips: TripsResponse | Trip[] | null | undefined): void {
  if (!trips || typeof document === 'undefined') return
  orderForScreen(trips).forEach((trip, i) => {
    const src = coverSrc(trip)
    if (!src || started.has(src)) return
    started.add(src)
    const high = i < HIGH_PRIORITY_COUNT
    if (high) {
      const link = document.createElement('link')
      link.rel = 'preload'
      link.setAttribute('as', 'image')
      link.href = src
      link.setAttribute('fetchpriority', 'high')
      // Same-origin with the session cookie (credentials follow the page).
      document.head.appendChild(link)
    }
    const img = new Image()
    img.decoding = 'async'
    ;(img as HTMLImageElement & { fetchPriority?: string }).fetchPriority = high ? 'high' : 'auto'
    img.src = src
    keep.push(img)
  })
}

// preloadCachedCovers runs at boot: the trips list saved on the device is
// read straight away (no network), so covers start before anything renders.
export async function preloadCachedCovers(): Promise<void> {
  try {
    const cached = await readCache<TripsResponse>(cacheKeys.trips())
    preloadCovers(cached?.data)
  } catch {
    // No saved list (first launch, or storage blocked): the dashboard
    // preloads once the list arrives.
  }
}

// _resetCoverPreloadForTesting clears the once-per-session memory.
export function _resetCoverPreloadForTesting(): void {
  started.clear()
  keep.length = 0
}
