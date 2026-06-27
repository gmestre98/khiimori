// Service-worker registration (M09.4 S2).
//
// Registers `/sw.js` (the hand-rolled app-shell cache) once the page has
// loaded, so caching never competes with the initial render. Registration is
// gated to production builds: in dev, a service worker would cache Vite's HMR
// modules and fight the dev server. Update/version handling is added in S5.

// registerServiceWorker registers the shell service worker. Safe to call
// unconditionally — it no-ops when the browser lacks support or when running
// outside a production build. Returns the registration (or null when skipped).
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!import.meta.env.PROD) return null
  if (!('serviceWorker' in navigator)) return null

  try {
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' })
  } catch (err) {
    // A failed registration must never break app boot — the app works online
    // without the worker; log so the failure is diagnosable.
    console.error('Service worker registration failed:', err)
    return null
  }
}
