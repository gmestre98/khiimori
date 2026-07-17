// Trip-region offline place index — validate/autocomplete *new* places offline.
//
// geocodeCache lets places the user has already seen validate offline, but a
// brand-new place typed with no connection has never been geocoded, so it can't
// resolve. This module closes that gap for the places that actually matter on a
// trip: while online it downloads a compact index of named POIs *inside each
// trip's geographic footprint* and stores it on-device, so offline the location
// field can still recognise a nearby place it's never seen — "Louvre" resolves
// against the Paris POIs we pre-loaded — and pin it.
//
// Data comes from OpenStreetMap via the public Overpass API, fetched directly
// from the browser. That mirrors how the app already pulls OSM raster tiles
// client-side (tilePrefetch): keyless, no Google Maps key involved, same
// fair-use posture — bounded result counts, a small number of regions, run once
// per session, best-effort and silent. The bounding boxes come for free from the
// trip stops the launch prefetch has already geocoded (offlinePrefetch), so this
// adds no extra Maps cost.
//
// Everything lives in the shared read cache (resourceCache) under one merged,
// deduped, capped index, so sign-out's clearCache wipes it and lookups don't need
// to know which trip they're in.

import type { LatLng } from './api'
import { cacheKeys } from './cacheKeys'
import { normalizeLocation } from './geocodeCache'
import { readCache, writeCache } from './resourceCache'
import type { Suggestion } from './api'

// RegionPlace is one named point of interest: the display name plus its
// coordinate. `norm` is the normalized name, precomputed so lookups don't
// re-normalize the whole index on every keystroke.
export interface RegionPlace {
  name: string
  norm: string
  lat: number
  lng: number
}

// PAD_DEG expands each region's bounding box outwards (~3 km) so places just
// beyond the outermost stop — the next café over — are still covered.
const PAD_DEG = 0.03

// CLUSTER_DEG groups stops into regions: any stop within ~25 km of a cluster
// joins it. This keeps each Overpass query over a city-sized box rather than one
// giant box spanning a multi-city trip (which would blow the result cap and the
// area a single query can sanely return).
const CLUSTER_DEG = 0.25

// MAX_REGIONS caps how many Overpass queries one warm issues, so a sprawling
// trip history can't fan out into dozens of calls. Largest clusters win.
const MAX_REGIONS = 8

// PLACES_PER_REGION bounds each Overpass response (`out center N`), and
// REGION_CAP bounds the merged on-device index. A single user's trips cover a
// handful of cities; the caps just stop pathological growth.
const PLACES_PER_REGION = 1500
const REGION_CAP = 8000

// SUGGEST_CAP mirrors the online Places dropdown — a short, scannable list.
const SUGGEST_CAP = 5

// MIN_NAME_LEN guards fuzzy matching: a two-letter POI name ("Bo") would match
// far too much, so only names this long take part in substring matching (exact
// matches are always allowed).
const MIN_NAME_LEN = 3

// OVERPASS_URL is the public Overpass endpoint (CORS-enabled). Overpass responds
// to a POST with the query in the `data` form field.
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'

// Region is a bounding box in degrees: south/west (min) to north/east (max).
export interface Region {
  south: number
  west: number
  north: number
  east: number
}

// clusterPoints greedily groups points so each group's members are within
// CLUSTER_DEG of the group's seed. Order-dependent and approximate — good enough
// to keep each region a sane size without a real clustering dependency.
export function clusterPoints(points: LatLng[]): LatLng[][] {
  const clusters: { seed: LatLng; members: LatLng[] }[] = []
  for (const p of points) {
    const near = clusters.find(
      (c) =>
        Math.abs(c.seed.lat - p.lat) <= CLUSTER_DEG && Math.abs(c.seed.lng - p.lng) <= CLUSTER_DEG,
    )
    if (near) near.members.push(p)
    else clusters.push({ seed: p, members: [p] })
  }
  return clusters.map((c) => c.members)
}

// boundingBox returns the padded bounding box covering all points, or null when
// there are none.
export function boundingBox(points: LatLng[]): Region | null {
  if (points.length === 0) return null
  let south = points[0].lat
  let north = points[0].lat
  let west = points[0].lng
  let east = points[0].lng
  for (const p of points) {
    south = Math.min(south, p.lat)
    north = Math.max(north, p.lat)
    west = Math.min(west, p.lng)
    east = Math.max(east, p.lng)
  }
  return {
    south: south - PAD_DEG,
    west: west - PAD_DEG,
    north: north + PAD_DEG,
    east: east + PAD_DEG,
  }
}

// regionsForPoints turns a trip's stops into up to MAX_REGIONS bounding boxes:
// cluster the stops, box each cluster, and keep the largest clusters when there
// are too many. Empty in → empty out.
export function regionsForPoints(points: LatLng[]): Region[] {
  const clusters = clusterPoints(points)
    .sort((a, b) => b.length - a.length)
    .slice(0, MAX_REGIONS)
  return clusters.map(boundingBox).filter((r): r is Region => r !== null)
}

// buildOverpassQuery builds the Overpass QL for named POIs inside a box. It asks
// for the tag families that map to somewhere a traveller would add to a plan
// (sights, food, culture, leisure), for both nodes and their way centroids, and
// caps the result with `out center`.
export function buildOverpassQuery(r: Region): string {
  const bbox = `${r.south},${r.west},${r.north},${r.east}`
  return [
    '[out:json][timeout:25];',
    '(',
    `  node["name"]["tourism"](${bbox});`,
    `  node["name"]["historic"](${bbox});`,
    `  node["name"]["leisure"](${bbox});`,
    `  node["name"]["amenity"~"restaurant|cafe|bar|pub|museum|theatre|cinema|marketplace|place_of_worship"](${bbox});`,
    `  way["name"]["tourism"](${bbox});`,
    `  way["name"]["historic"](${bbox});`,
    ')',
    `;out center ${PLACES_PER_REGION};`,
  ].join('\n')
}

// OverpassElement is the slice of an Overpass element we use: a name in `tags`,
// and coordinates either directly (nodes) or via `center` (ways).
interface OverpassElement {
  tags?: { name?: string }
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
}

// parseOverpass maps a raw Overpass response to RegionPlaces, dropping anything
// without both a name and a coordinate.
export function parseOverpass(body: unknown): RegionPlace[] {
  const elements = (body as { elements?: OverpassElement[] })?.elements
  if (!Array.isArray(elements)) return []
  const out: RegionPlace[] = []
  for (const el of elements) {
    const name = el.tags?.name?.trim()
    const lat = el.lat ?? el.center?.lat
    const lng = el.lon ?? el.center?.lon
    if (!name || typeof lat !== 'number' || typeof lng !== 'number') continue
    out.push({ name, norm: normalizeLocation(name), lat, lng })
  }
  return out
}

// mergeIntoIndex folds freshly fetched places into the stored index, keeping the
// newest coordinate for a given normalized name (deduped) and trimming to
// REGION_CAP with the just-fetched places kept first.
async function mergeIntoIndex(fresh: RegionPlace[]): Promise<void> {
  if (fresh.length === 0) return
  const current = (await readCache<RegionPlace[]>(cacheKeys.regionPlaces()))?.data ?? []
  const byNorm = new Map<string, RegionPlace>()
  for (const p of [...fresh, ...current]) {
    if (!byNorm.has(p.norm)) byNorm.set(p.norm, p)
  }
  await writeCache(cacheKeys.regionPlaces(), [...byNorm.values()].slice(0, REGION_CAP))
}

// fetchRegion queries Overpass for one box and returns its places, or [] on any
// failure (offline, rate-limited, malformed) — best-effort, never throws.
async function fetchRegion(r: Region, signal?: AbortSignal): Promise<RegionPlace[]> {
  try {
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(buildOverpassQuery(r))}`,
      signal,
    })
    if (!res.ok) return []
    return parseOverpass(await res.json())
  } catch {
    return []
  }
}

// warmRegionPlaces downloads and caches named POIs around the given stops. Called
// by the launch prefetch with every trip's already-geocoded stops. Regions are
// fetched sequentially (gentle on Overpass) and merged into the index one at a
// time. Best-effort and silent — a failed region just isn't covered this session.
export async function warmRegionPlaces(points: LatLng[], signal?: AbortSignal): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return
  for (const region of regionsForPoints(points)) {
    if (signal?.aborted) return
    const places = await fetchRegion(region, signal)
    await mergeIntoIndex(places)
  }
}

// readIndex returns the stored region index (empty on a miss).
async function readIndex(): Promise<RegionPlace[]> {
  return (await readCache<RegionPlace[]>(cacheKeys.regionPlaces()))?.data ?? []
}

// lookupRegionPlace resolves a typed location against the region index, for
// offline validation. It prefers an exact normalized-name match; failing that it
// accepts a place whose name the query contains ("Louvre, Paris" → "Louvre") or
// that contains the query ("Louvre" → "Musée du Louvre"), longest name winning
// so the most specific POI is chosen. Returns coords or null.
export async function lookupRegionPlace(location: string): Promise<LatLng | null> {
  const q = normalizeLocation(location)
  if (!q) return null
  const index = await readIndex()
  let best: RegionPlace | null = null
  for (const p of index) {
    if (p.norm === q) return { lat: p.lat, lng: p.lng }
    if (p.norm.length < MIN_NAME_LEN) continue
    const contained = p.norm.includes(q) || q.includes(p.norm)
    if (contained && (!best || p.norm.length > best.norm.length)) best = p
  }
  return best ? { lat: best.lat, lng: best.lng } : null
}

// searchRegionPlaces returns offline autocomplete suggestions from the region
// index: places whose name contains the typed query, capped. place_id is empty
// (these are local OSM echoes, not fresh Places predictions).
export async function searchRegionPlaces(input: string): Promise<Suggestion[]> {
  const q = normalizeLocation(input)
  if (!q) return []
  const index = await readIndex()
  const out: Suggestion[] = []
  for (const p of index) {
    if (p.norm.includes(q)) out.push({ description: p.name, place_id: '' })
    if (out.length >= SUGGEST_CAP) break
  }
  return out
}
