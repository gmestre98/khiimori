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
 * Other cross-origin requests (map tiles, fonts) are left to the network.
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
 */

const CACHE_VERSION = 'v3'
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
function isCacheableRead(request, url) {
  if (request.method !== 'GET') return false
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
