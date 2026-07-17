// Service-worker registration + update handling (M09.4 S2, refined in S5).
//
// Registers `/sw.js` (the hand-rolled app-shell cache) once the page has
// loaded, so caching never competes with the initial render.
//
// Update / version policy (S5):
//   1. On install the new worker waits (no skipWaiting in sw.js).
//   2. registerSW detects the waiting worker via `updatefound` and immediately
//      posts SKIP_WAITING — the new worker takes control.
//   3. The worker broadcasts SW_ACTIVATED to all clients on activate.
//   4. We reload the page on controllerchange so the fresh shell is loaded.
//
// Effect: users get the update on the first page load after deploy. An
// in-flight session is never disrupted mid-use; there is no stale-forever risk.
//
// Production-only: in dev a service worker caches Vite HMR modules and fights
// the dev server. Pass `onUpdateReady` to be called before the reload if you
// need to show a "Updating…" state.

export async function registerServiceWorker(
  onUpdateReady?: () => void,
): Promise<ServiceWorkerRegistration | null> {
  if (!import.meta.env.PROD) return null
  if (!('serviceWorker' in navigator)) return null

  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })

    // Record whether a controller already existed at registration time. If not,
    // a subsequent controllerchange is just first-install (clients.claim()), not
    // an update — we must not reload in that case.
    const hadController = !!navigator.serviceWorker.controller

    // Detect an already-waiting worker (page refreshed while an update was
    // pending) and trigger the update immediately.
    if (reg.waiting) {
      applyUpdate(reg, onUpdateReady)
    }

    // Detect future updates found during this session.
    reg.addEventListener('updatefound', () => {
      const installing = reg.installing
      if (!installing) return
      installing.addEventListener('statechange', () => {
        if (installing.state === 'installed' && reg.waiting) {
          applyUpdate(reg, onUpdateReady)
        }
      })
    })

    // Reload when the new worker takes control — but only if there was already
    // a prior controller (i.e. this is a real update, not a first install).
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController) window.location.reload()
    })

    // Ask the browser to refresh the offline data in the background (Chromium /
    // Android Chrome when installed). Best-effort: a no-op where unsupported.
    void registerPeriodicRefresh(reg)

    return reg
  } catch (err) {
    // A failed registration must never break app boot — the app works online
    // without the worker; log so the failure is diagnosable.
    console.error('Service worker registration failed:', err)
    return null
  }
}

// applyUpdate posts SKIP_WAITING to the waiting worker, signalling it to take
// control. The worker then broadcasts SW_ACTIVATED; we reload on controllerchange.
function applyUpdate(reg: ServiceWorkerRegistration, onUpdateReady?: () => void): void {
  onUpdateReady?.()
  reg.waiting?.postMessage({ type: 'SKIP_WAITING' })
}

// REFRESH_TAG must match the tag the service worker's periodicsync handler
// checks for (see sw.js). REFRESH_INTERVAL_MS is the *minimum* we ask for; the
// browser decides the real cadence (typically ~once a day) based on engagement.
const REFRESH_TAG = 'khiimori-refresh'
const REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000

// PeriodicSyncManager is the slice of the Periodic Background Sync API we use.
// It isn't in the DOM lib types, so we declare the minimum surface locally.
interface PeriodicSyncManager {
  register(tag: string, options?: { minInterval: number }): Promise<void>
  getTags(): Promise<string[]>
}

// registerPeriodicRefresh asks the browser to wake the worker on its own
// schedule to refresh the offline data (see sw.js periodicsync), so an itinerary
// stays current even when the app hasn't been opened in a while.
//
// This only works on Chromium (Android Chrome) with the PWA installed and enough
// site engagement for the browser to grant the 'periodic-background-sync'
// permission — there is no prompt; the browser grants it silently or not. iOS
// has no support at all. Every branch below degrades to a quiet no-op, so the
// caller never has to care whether it took: unsupported platforms simply keep
// relying on the open-time pre-warm.
async function registerPeriodicRefresh(reg: ServiceWorkerRegistration): Promise<void> {
  const periodicSync = (reg as ServiceWorkerRegistration & { periodicSync?: PeriodicSyncManager })
    .periodicSync
  if (!periodicSync) return // Unsupported (e.g. iOS, non-Chromium) — no-op.

  try {
    // Only register when the permission is already granted; querying avoids a
    // guaranteed-to-reject register() on browsers that expose the API but
    // withhold the permission. Some engines lack this permission name in
    // Permissions.query — treat a throw as "can't tell, try anyway".
    let granted = true
    try {
      const status = await navigator.permissions.query({
        // 'periodic-background-sync' isn't in the PermissionName union type yet.
        name: 'periodic-background-sync' as PermissionName,
      })
      granted = status.state === 'granted'
    } catch {
      granted = true
    }
    if (!granted) return

    // Idempotent: skip if we've already registered this tag.
    const tags = await periodicSync.getTags()
    if (tags.includes(REFRESH_TAG)) return

    await periodicSync.register(REFRESH_TAG, { minInterval: REFRESH_INTERVAL_MS })
  } catch {
    // Registration can reject (permission withheld, quota, etc.) — the app works
    // fine without background refresh, so swallow and fall back to the pre-warm.
  }
}
