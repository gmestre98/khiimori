/*
 * Khiimori service worker — app-shell caching (M09.4 S2) + offline current-trip
 * data (M09.4 S3).
 *
 * Hand-rolled (no Workbox / vite-plugin-pwa) per the project's no-deps rule
 * (PRD §7.0): the logic is small enough to own directly and stay auditable.
 *
 * Caching strategy
 * ----------------
 *   • App shell (navigations): NETWORK-FIRST, falling back to a cached
 *     `index.html`. Online users always get the freshest HTML; offline users
 *     get the SPA shell so the app boots and React Router takes over.
 *   • Hashed build assets (`/assets/*`): CACHE-FIRST. Vite fingerprints these
 *     filenames, so a cached entry is immutable — serving it offline is safe
 *     and instant. New deploys ship new filenames, which get cached on first
 *     online load; stale ones are dropped when the cache version bumps.
 *   • Other same-origin static files (icons, manifest, favicon): cache-first
 *     so the installed shell renders offline.
 *   • Trip API reads: NETWORK-FIRST across ALL of the user's trips. GET requests
 *     for `/trips`, `/trips/<id>/…`, `/me` and `/invitations` are served from the
 *     network when online (and cached), and from the cache when offline. Unlike
 *     the earlier active-trip-only scheme, the data cache is NOT bounded to one
 *     trip and is NOT wiped on trip switch: every trip the app has loaded (the
 *     app pre-warms them all on launch — see offlinePrefetch.ts) stays available
 *     offline. Trip JSON is small (tens of KB per trip), so holding the whole
 *     history costs a few MB at most.
 *
 *   • OSM map tiles (cross-origin `*.tile.openstreetmap.org`): CACHE-FIRST in a
 *     dedicated, size-bounded tile cache so a trip's maps render offline once its
 *     tiles have been pre-fetched (offlinePrefetch → tilePrefetch) or viewed
 *     online. Subdomains are normalised to one key; the cache survives app
 *     updates (tiles are immutable) and is pruned to a max entry count.
 *
 * Other cross-origin requests (fonts, etc.) are left to the network.
 * Update/version handling is refined in S5.
 *
 * Update / version handling (M09.4 S5)
 * ─────────────────────────────────────
 * Policy: simple and correct — avoids the stale-forever trap without forcing
 * mid-session disruption.
 *
 *   1. A new SW installs silently in the background (no skipWaiting on install).
 *   2. When the app (via registerSW) detects a waiting worker it posts
 *      SKIP_WAITING here; the new worker takes control immediately.
 *   3. On activate the worker broadcasts SW_ACTIVATED so clients can reload and
 *      pick up the fresh shell.
 *   4. registerSW listens for controllerchange and reloads the page.
 *
 * Net effect: users get the update on the next full page load after deploy. An
 * in-flight session is never swapped mid-use; there is no stale-forever risk
 * because the app always reloads when a new controller takes over.
 *
 * Versioning: bump CACHE_VERSION to invalidate the caches on the next activate.
 *
 * Background refresh (Periodic Background Sync)
 * ────────────────────────────────────────────
 * The foreground pre-warm (offlinePrefetch.ts) only runs while the app is open,
 * so a trip's offline copy is only as fresh as the last time you opened Khiimori.
 * The `periodicsync` handler below closes that gap on browsers that support it
 * (Chromium / Android Chrome, PWA installed): the browser wakes the worker on
 * its own schedule — roughly daily, only when online and typically on charge —
 * and we re-walk every trip's reads into the data cache. So when you next open
 * the app (even offline) the itinerary is already up to date without you having
 * opened it first. iOS does NOT support Periodic Background Sync — there the app
 * still relies on the open-time pre-warm, which is the best the platform allows.
 * Registration lives in registerSW.ts and is a silent no-op where unsupported.
 */

const CACHE_VERSION = 'v3'
const CACHE_NAME = `khiimori-shell-${CACHE_VERSION}`
const DATA_CACHE = `khiimori-data-${CACHE_VERSION}`

// TILE_CACHE holds OpenStreetMap raster tiles for offline maps. Kept separate
// from the data cache (different lifecycle, and it's the one cache we bound by
// size). Deliberately NOT suffixed with CACHE_VERSION: tiles are effectively
// immutable and expensive to re-fetch, so they survive app updates instead of
// being thrown away on every deploy. It is pruned by MAX_TILE_ENTRIES below.
const TILE_CACHE = 'khiimori-tiles'

// MAX_TILE_ENTRIES caps how many tiles we keep so opportunistic caching (tiles
// fetched as the user pans while online) plus pre-fetch can't grow without
// bound. At ~20 KB/tile this holds the tile cache near ~50 MB. When exceeded we
// evict the oldest entries (Cache API preserves insertion order in keys()).
const MAX_TILE_ENTRIES = 2500

// TILE_HOST_RE matches OSM tile requests (any a/b/c subdomain or the bare host).
const TILE_HOST_RE = /(^|\.)tile\.openstreetmap\.org$/

// The minimal shell precached on install. Hashed JS/CSS are intentionally NOT
// listed (their names are unknown at author time) — they are runtime-cached on
// first load instead. The SPA fallback document is `/index.html`.
const SHELL_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/pwa-maskable-512x512.png',
  '/apple-touch-icon.png',
]

// isCacheableRead reports whether a request is a GET we cache for offline
// viewing. Matches on path suffix so it works whether the API is same-origin
// (the web app's /api/** rewrite) or a separate origin. We cache the user's
// account- and trip-scoped reads across ALL trips (not just an active one) so
// every trip the app has loaded stays available offline:
//   • the trips listing (`…/trips`) — small, and TripShell needs it to resolve
//     a trip's name/dates when reloaded offline;
//   • any `…/trips/<id>/…` path — days, plan items, budget, journal, for any id;
//   • `…/me` (the profile) and `…/invitations` (the in-app invite inbox).
// The app pre-warms these for every trip on launch (offlinePrefetch.ts), so an
// offline start finds them all cached. Trip JSON is small, so caching the whole
// history is only a few MB.
//
// Only API requests qualify — never the app's own SPA navigations, which share
// the `/trips/<id>/…` path space. Same-origin API lives under `/api/**` (the
// Hosting → Cloud Run rewrite); the dev API is a separate origin. A same-origin
// document request to `/trips/<id>/days/<date>` (a hard reload or deep link) is
// therefore NOT cacheable here and falls through to the app-shell handler.
function isCacheableRead(request, url) {
  if (request.method !== 'GET') return false
  const isApi = url.origin !== self.location.origin || url.pathname.startsWith('/api/')
  if (!isApi) return false
  const p = url.pathname
  if (p.endsWith('/trips')) return true
  if (p.endsWith('/me') || p.endsWith('/invitations')) return true
  return p.includes('/trips/')
}

// install: precache the shell. waitUntil keeps the worker alive until done.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)),
    // Note: we do NOT skipWaiting() here — S5 owns the update-activation policy
    // so an in-flight session isn't swapped out from under the user.
  )
})

// activate: drop stale caches and claim all clients so they get the new shell
// immediately (without waiting for a full page reload per-client).
// Broadcasts SW_ACTIVATED so the app can reload and pick up the new shell.
self.addEventListener('activate', (event) => {
  const keep = new Set([CACHE_NAME, DATA_CACHE, TILE_CACHE])
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('khiimori-') && !keep.has(key))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim())
      .then(() =>
        self.clients
          .matchAll({ type: 'window' })
          .then((clients) =>
            clients.forEach((c) => c.postMessage({ type: 'SW_ACTIVATED', version: CACHE_VERSION })),
          ),
      ),
  )
})

// SKIP_WAITING: the app (registerSW) posts this when it detects a new worker
// waiting. Calling skipWaiting() here makes the new SW take control of all
// clients; they then receive SW_ACTIVATED via the activate handler above and
// reload to pick up the fresh shell.
self.addEventListener('message', (event) => {
  const data = event.data
  if (!data) return
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

// cacheFirst: serve from cache if present, otherwise fetch + store, otherwise
// fail through to the caller. Used for fingerprinted assets and static files.
async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME)
  const cached = await cache.match(request)
  if (cached) return cached
  const response = await fetch(request)
  // Only cache successful, basic (same-origin) responses.
  if (response.ok && response.type === 'basic') {
    cache.put(request, response.clone())
  }
  return response
}

// tileCacheKey normalises an OSM tile request to a single subdomain-less key so
// the a/b/c subdomains Leaflet rotates through (and the bare host the pre-fetcher
// uses) all resolve to one cache entry — otherwise the same tile could be stored
// up to four times and a pre-fetched tile would miss when Leaflet asked for it
// via a different subdomain. Keyed by URL string (GET), which cache.match accepts.
function tileCacheKey(url) {
  return `https://tile.openstreetmap.org${url.pathname}`
}

// cacheFirstTile serves an OSM tile from the tile cache, falling back to the
// network and caching the result. Tiles are cross-origin and load as opaque
// responses (status 0, type 'opaque') — we cache those too (can't inspect them,
// but they render fine), which is why this is separate from cacheFirst. After a
// network store we prune the cache back under MAX_TILE_ENTRIES (oldest first).
// On a network failure with nothing cached we just propagate the failure so
// Leaflet shows its usual blank tile — no synthetic response needed.
async function cacheFirstTile(request, url) {
  const cache = await caches.open(TILE_CACHE)
  const key = tileCacheKey(url)
  const cached = await cache.match(key)
  if (cached) return cached
  const response = await fetch(request)
  // Cache successful basic/opaque responses; skip error statuses (a 404/timeout
  // opaque response still has status 0, so also require the fetch not to reject).
  if (response.status === 200 || response.type === 'opaque') {
    await cache.put(key, response.clone())
    void pruneTileCache(cache)
  }
  return response
}

// pruneTileCache evicts the oldest entries when the tile cache grows past
// MAX_TILE_ENTRIES. keys() yields entries in insertion order, so the front of
// the list is the oldest. Best-effort; runs after a put and never blocks it.
async function pruneTileCache(cache) {
  const keys = await cache.keys()
  const overflow = keys.length - MAX_TILE_ENTRIES
  if (overflow <= 0) return
  for (let i = 0; i < overflow; i++) {
    await cache.delete(keys[i])
  }
}

// networkFirstShell: try the network (fresh shell), fall back to the cached
// `index.html` when offline so the SPA still boots.
async function networkFirstShell(request) {
  const cache = await caches.open(CACHE_NAME)
  try {
    const response = await fetch(request)
    // Keep the cached shell fresh for the next offline boot.
    if (response.ok) cache.put('/index.html', response.clone())
    return response
  } catch (err) {
    const cached = (await cache.match('/index.html')) || (await cache.match('/'))
    if (cached) return cached
    throw err
  }
}

// networkFirstData: serve fresh current-trip data when online (and cache it for
// later), fall back to the cached copy when offline. When neither is available
// (offline + never fetched), return a synthetic 503 so the app shows its normal
// "couldn't load" state instead of throwing an opaque network error.
async function networkFirstData(request) {
  const cache = await caches.open(DATA_CACHE)
  try {
    const response = await fetch(request)
    if (response.ok) cache.put(request, response.clone())
    return response
  } catch (err) {
    const cached = await cache.match(request)
    if (cached) return cached
    return new Response(JSON.stringify({ error: { message: 'offline' } }), {
      status: 503,
      statusText: 'Offline',
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event

  // Only handle GET; let everything else (POST writes, etc.) hit the network.
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // Cacheable API reads (same-origin under /api, or cross-origin) → network-first
  // data cache, across all trips (see isCacheableRead).
  if (isCacheableRead(request, url)) {
    event.respondWith(networkFirstData(request))
    return
  }

  // Any other API call is same-origin now (Firebase Hosting rewrites /api/** to
  // Cloud Run) but must NOT be treated as the app shell or a static asset: it is
  // dynamic, auth-bearing data. Pass it straight to the network. Without this the
  // OAuth GET navigations (/api/auth/login, /api/auth/callback) would fall into
  // the app-shell fallback and break sign-in. (Data reads worth keeping offline
  // are handled by isCacheableRead above; the rest stay network-only.)
  if (url.pathname.startsWith('/api/')) return

  // OSM map tiles (cross-origin) → cache-first tile cache, so a trip's maps work
  // offline once its tiles have been pre-fetched (tilePrefetch) or viewed online.
  if (TILE_HOST_RE.test(url.hostname)) {
    event.respondWith(cacheFirstTile(request, url))
    return
  }

  // Other cross-origin (fonts, etc.) → network.
  if (url.origin !== self.location.origin) return

  // Navigations → app shell (network-first).
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstShell(request))
    return
  }

  // Same-origin static assets → cache-first.
  event.respondWith(cacheFirst(request))
})

// ── Background refresh (Periodic Background Sync) ────────────────────────────
//
// REFRESH_TAG must match the tag registerSW.ts registers with. minInterval is
// requested there; the browser picks the actual cadence (typically ~once a day).
const REFRESH_TAG = 'khiimori-refresh'

// In production the API is same-origin under /api (Firebase Hosting rewrites to
// Cloud Run), and the service worker only registers in production (see
// registerSW.ts), so /api is always the right base here. Same-origin fetches
// carry the httpOnly __session cookie automatically, so these reads are
// authenticated without any token handling in the worker.
const API_BASE = '/api'

// refreshCache fetches one API read and, when it succeeds, stores it in the data
// cache so the next offline open serves the fresh copy. Returns the parsed JSON
// (for reads we need to walk further, e.g. the trip list) or null on any failure
// — background refresh is best-effort, exactly like the foreground pre-warm.
async function refreshCache(path) {
  try {
    const res = await fetch(`${API_BASE}${path}`)
    if (!res.ok) return null
    const cache = await caches.open(DATA_CACHE)
    await cache.put(`${API_BASE}${path}`, res.clone())
    return await res.json()
  } catch {
    return null
  }
}

// datesInRange lists every YYYY-MM-DD from start to end inclusive. Mirrors the
// app's datesInRange (api.ts) so the worker can walk a trip's days without the
// app bundle. Uses UTC to stay off DST boundaries (dates are calendar days).
function datesInRange(startDate, endDate) {
  const dates = []
  const cur = new Date(`${startDate}T00:00:00Z`)
  const end = new Date(`${endDate}T00:00:00Z`)
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10))
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return dates
}

// refreshTrip re-fetches one trip's cross-cutting reads and every one of its
// days (plus each day's journal). Sequential and unhurried: this runs in the
// background against a scale-to-zero backend, so we favour gentleness over
// speed. Map tiles and geocodes are intentionally left alone — they're
// effectively immutable and already cached from foreground use; only the trip
// JSON goes stale, and that's what we refresh here.
async function refreshTrip(trip) {
  await refreshCache(`/trips/${trip.id}/plan-items/backlog`)
  await refreshCache(`/trips/${trip.id}/budget/rollup`)
  await refreshCache(`/trips/${trip.id}/cost-entries`)
  for (const date of datesInRange(trip.start_date, trip.end_date)) {
    const day = await refreshCache(`/trips/${trip.id}/days/${date}`)
    if (day && day.id) await refreshCache(`/trips/${trip.id}/days/${day.id}/journal`)
  }
}

// refreshAllTrips re-warms the whole offline data set: the profile, invitations,
// the trip list, and every trip within it. Best-effort throughout — a failed
// read just leaves that entry as stale as it already was. Never throws.
async function refreshAllTrips() {
  await refreshCache('/me')
  await refreshCache('/invitations')
  const trips = await refreshCache('/trips')
  if (!trips) return
  const all = [...(trips.current || []), ...(trips.upcoming || []), ...(trips.past || [])]
  for (const trip of all) {
    await refreshTrip(trip)
  }
}

// periodicsync fires on the browser's schedule (when supported and granted) with
// the app closed. waitUntil keeps the worker alive until the refresh finishes.
self.addEventListener('periodicsync', (event) => {
  if (event.tag === REFRESH_TAG) {
    event.waitUntil(refreshAllTrips())
  }
})
