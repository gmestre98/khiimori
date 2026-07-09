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
 *   • Current-trip API reads (S3): NETWORK-FIRST scoped to the active trip.
 *     GET requests for `/trips/<activeTripId>/…` are served from the network
 *     when online (and cached), and from the cache when offline. The active
 *     trip is set by the app via postMessage; switching trips clears the data
 *     cache so storage stays bounded to one trip (not the whole history).
 *
 * Other cross-origin requests (maps, fonts) and non-active-trip API calls are
 * left to the network. Update/version handling is refined in S5.
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
 */

const CACHE_VERSION = 'v2'
const CACHE_NAME = `khiimori-shell-${CACHE_VERSION}`
const DATA_CACHE = `khiimori-data-${CACHE_VERSION}`

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

// The trip whose API reads are currently being cached. Set by the app via a
// SET_ACTIVE_TRIP message; null when no trip screen is open. Gates whether trip
// reads are intercepted.
let activeTripId = null

// The trip whose data is currently held in DATA_CACHE. Distinct from
// activeTripId so that leaving a trip (activeTripId → null) keeps its cached
// data viewable later; the cache is only dropped when a *different* trip opens.
let cachedTripId = null

// isCacheableRead reports whether a request is a GET we cache for offline
// current-trip viewing. Matches on path suffix so it works whether the API is
// same-origin (the web app's /api/** rewrite) or a separate origin:
//   • the trips listing (`…/trips`) — small, and TripShell needs it to resolve
//     the open trip's name/dates when reloaded offline;
//   • any `/trips/<activeTripId>/…` path — days, plan items, budget, journal.
// The trailing slash on the trip path avoids matching a different trip whose id
// is a prefix of the active one. Bounded to the active trip (switching clears
// the data cache), so storage never grows to the whole history.
function isCacheableRead(request, url) {
  if (request.method !== 'GET') return false
  if (url.pathname.endsWith('/trips')) return true
  return activeTripId !== null && url.pathname.includes(`/trips/${activeTripId}/`)
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
  const keep = new Set([CACHE_NAME, DATA_CACHE])
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
    return
  }
  if (data.type !== 'SET_ACTIVE_TRIP') return
  activeTripId = data.tripId
  if (activeTripId !== null && activeTripId !== cachedTripId) {
    cachedTripId = activeTripId
    event.waitUntil(caches.delete(DATA_CACHE))
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

  // Current-trip API reads (same-origin under /api, or cross-origin) →
  // network-first data cache.
  if (isCacheableRead(request, url)) {
    event.respondWith(networkFirstData(request))
    return
  }

  // Any other API call is same-origin now (Firebase Hosting rewrites /api/** to
  // Cloud Run) but must NOT be treated as the app shell or a static asset: it is
  // dynamic, auth-bearing data. Pass it straight to the network. Without this the
  // OAuth GET navigations (/api/auth/login, /api/auth/callback) would fall into
  // the app-shell fallback and break sign-in, and reads like /api/me would land
  // in the cache-first asset store and be served stale indefinitely.
  if (url.pathname.startsWith('/api/')) return

  // Other cross-origin (map tiles, fonts) → network.
  if (url.origin !== self.location.origin) return

  // Navigations → app shell (network-first).
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstShell(request))
    return
  }

  // Same-origin static assets → cache-first.
  event.respondWith(cacheFirst(request))
})
