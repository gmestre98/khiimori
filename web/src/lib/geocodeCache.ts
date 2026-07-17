// On-device geocode cache — offline location validation + autocomplete.
//
// The location field (LocationField) validates what the user types by asking the
// geo proxy to geocode it (GET /geo/geocode) and offers place suggestions from
// Google Places (GET /geo/autocomplete). Both are network calls, so offline the
// field goes blind: no "✓ Found", no suggestions. This module closes that gap
// with a small write-through cache over resourceCache, so places the user has
// seen or used before keep validating — and keep autocompleting — with no
// network.
//
// It stores two things, both in the shared read cache (so sign-out's clearCache
// wipes them too):
//   • per-string geocode results, keyed by the normalized query — the coords, or
//     an explicit null recording "we checked and this isn't a place";
//   • an MRU index of the place strings that did resolve, so offline autocomplete
//     can match against them by substring.
//
// Nothing here geocodes on its own: the cache is filled as a side effect of the
// geocodes the app already performs (the field's live check, and — for free —
// every day's batched day-route, see dayRouteCache). So offline coverage grows
// naturally as the user browses their trips online, and the launch prefetch
// pre-warms every known stop without a single extra Maps call.

import { geocodeLocation, UnauthorizedError, type LatLng, type Suggestion } from './api'
import { cacheKeys } from './cacheKeys'
import { lookupRegionPlace, searchRegionPlaces } from './regionPlaces'
import { readCache, writeCache } from './resourceCache'

// INDEX_CAP bounds the offline-autocomplete index. A single user's whole trip
// history is a few hundred distinct places at most; the cap just stops a
// pathological session from growing it without limit.
const INDEX_CAP = 500

// SUGGEST_CAP mirrors what the Places proxy returns — a short, scannable list.
const SUGGEST_CAP = 5

// CachedGeocode is the persisted per-string result. `coords` is the resolved
// point, or null when the query was checked and found not to be a place — a
// distinction the field shows differently ("Found" vs "couldn't place this").
interface CachedGeocode {
  coords: LatLng | null
}

// IndexEntry keeps the place's original (display) form alongside its normalized
// key so offline suggestions read exactly like the online ones.
interface IndexEntry {
  description: string
  norm: string
}

// normalizeLocation collapses a free-text location to a stable cache key:
// trimmed, inner whitespace collapsed, lower-cased. Two inputs that differ only
// in spacing or case share one entry (and one Maps lookup's worth of coverage).
export function normalizeLocation(location: string): string {
  return location.trim().replace(/\s+/g, ' ').toLowerCase()
}

// readCachedGeocode returns the stored result for a location, or null on a miss.
// A hit whose `coords` is null means "known not-a-place"; a hit with coords is a
// known place. Never throws (resourceCache swallows storage errors).
export async function readCachedGeocode(location: string): Promise<CachedGeocode | null> {
  const norm = normalizeLocation(location)
  if (!norm) return null
  const hit = await readCache<CachedGeocode>(cacheKeys.geocode(norm))
  return hit ? hit.data : null
}

// writeCachedGeocode records a geocode outcome and, when it resolved, folds the
// place into the offline-autocomplete index (MRU, deduped, capped). Best-effort:
// a storage failure just means that place isn't cached yet.
export async function writeCachedGeocode(location: string, coords: LatLng | null): Promise<void> {
  const norm = normalizeLocation(location)
  if (!norm) return
  await writeCache(cacheKeys.geocode(norm), { coords } satisfies CachedGeocode)
  if (coords) await addToIndex(location.trim(), norm)
}

// addToIndex moves `description` to the front of the MRU index under `norm`,
// removing any prior entry for the same key and trimming to INDEX_CAP.
async function addToIndex(description: string, norm: string): Promise<void> {
  const current = (await readCache<IndexEntry[]>(cacheKeys.geocodeIndex()))?.data ?? []
  const next = [{ description, norm }, ...current.filter((e) => e.norm !== norm)].slice(
    0,
    INDEX_CAP,
  )
  await writeCache(cacheKeys.geocodeIndex(), next)
}

// GeoResolution is what resolveLocation returns. `source` tells the caller
// whether the answer is fresh from the network or served from the offline cache,
// which is useful for messaging and tests.
export interface GeoResolution {
  coords: LatLng | null
  source: 'live' | 'cache'
}

// resolveLocation is the field's cache-aware geocode: network-first, writing
// every fresh result through to the cache, and falling back to the last-known
// cached result when the network is unavailable. It throws only when it truly
// can't answer — an abort, an auth failure, or an offline miss with nothing
// cached — so the field can show a distinct "can't check right now" state rather
// than a misleading "not a place".
export async function resolveLocation(
  location: string,
  signal?: AbortSignal,
): Promise<GeoResolution> {
  try {
    const coords = await geocodeLocation(location, signal)
    void writeCachedGeocode(location, coords)
    return { coords, source: 'live' }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    // An auth failure isn't a network gap — don't mask it with a stale hit.
    if (err instanceof UnauthorizedError) throw err
    const cached = await readCachedGeocode(location)
    if (cached) return { coords: cached.coords, source: 'cache' }
    // Never geocoded before, but it may be a POI we pre-loaded around the trip
    // (regionPlaces). A hit there validates a brand-new place offline; remember
    // it so the next lookup is a plain cache hit.
    const region = await lookupRegionPlace(location)
    if (region) {
      void writeCachedGeocode(location, region)
      return { coords: region, source: 'cache' }
    }
    throw err
  }
}

// suggestLocalPlaces returns offline autocomplete suggestions: places from the
// index whose text contains the typed query, most-recently-used first. Used as
// the fallback when the Places proxy can't be reached. place_id is empty (these
// are local echoes of prior results, not fresh Places predictions).
export async function suggestLocalPlaces(input: string): Promise<Suggestion[]> {
  const norm = normalizeLocation(input)
  if (!norm) return []
  const index = (await readCache<IndexEntry[]>(cacheKeys.geocodeIndex()))?.data ?? []
  const out: Suggestion[] = []
  for (const e of index) {
    if (e.norm.includes(norm)) out.push({ description: e.description, place_id: '' })
    if (out.length >= SUGGEST_CAP) break
  }
  return out
}

// offlineSuggestions is the field's whole offline autocomplete: places the user
// has geocoded before (suggestLocalPlaces) plus POIs pre-loaded around the trip
// (searchRegionPlaces), merged, deduped by name and capped. Recently-used places
// come first so the user's own history outranks the wider region.
export async function offlineSuggestions(input: string): Promise<Suggestion[]> {
  const [mru, region] = await Promise.all([suggestLocalPlaces(input), searchRegionPlaces(input)])
  const seen = new Set<string>()
  const out: Suggestion[] = []
  for (const s of [...mru, ...region]) {
    const key = normalizeLocation(s.description)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(s)
    if (out.length >= SUGGEST_CAP) break
  }
  return out
}

// warmGeocodeFromWaypoints opportunistically fills the per-string cache from a
// day's batched geocode (dayRouteCache), at zero extra Maps cost. The day-route
// response is positional — one waypoint per location, in order, null where a stop
// didn't resolve — so waypoints[i] is exactly the result for locations[i]. Only
// resolved stops are folded in: a null (server couldn't geocode) is deliberately
// NOT cached as known-not-a-place, because that would shadow the region-POI
// offline fallback (resolveLocation trusts a cached null before searching the
// trip-region POIs). Best-effort and fire-and-forget; the equal-length check is a
// defensive guard on the positional contract.
export async function warmGeocodeFromWaypoints(
  locations: string[],
  waypoints: (LatLng | null)[],
): Promise<void> {
  if (locations.length === 0 || locations.length !== waypoints.length) return
  // Sequential, not Promise.all: every write folds into the same MRU index via a
  // read-modify-write, so running them concurrently would let the writes clobber
  // one another and leave the index with only one stop.
  for (let i = 0; i < locations.length; i++) {
    const wp = waypoints[i]
    if (wp) await writeCachedGeocode(locations[i], wp)
  }
}
