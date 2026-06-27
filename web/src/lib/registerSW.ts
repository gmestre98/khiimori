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
