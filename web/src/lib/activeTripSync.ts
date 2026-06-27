// Active-trip → service-worker sync (M09.4 S3).
//
// Tells the service worker which trip is currently open so it can cache that
// trip's API reads for offline viewing (and clear the cache when the user
// switches trips, keeping storage bounded to one trip). No-ops cleanly when
// there is no controlling worker (dev, unsupported browsers, first load before
// the worker activates).

import { useEffect } from 'react'

// setActiveTripForOffline posts the active trip id to the controlling service
// worker. Pass null when leaving trip context. Safe to call anywhere.
export function setActiveTripForOffline(tripId: string | null): void {
  if (!('serviceWorker' in navigator)) return
  navigator.serviceWorker.controller?.postMessage({ type: 'SET_ACTIVE_TRIP', tripId })
}

// useActiveTripOffline registers `tripId` as the offline-cached trip for the
// lifetime of the component. It re-sends when `tripId` changes and clears the
// active trip (null) on unmount, so leaving the trip stops caching its reads.
//
// The worker may activate slightly after first paint; we also re-send once it
// takes control (controllerchange) so the very first trip view still registers.
export function useActiveTripOffline(tripId: string | null): void {
  useEffect(() => {
    if (!tripId) return
    setActiveTripForOffline(tripId)

    const resend = () => setActiveTripForOffline(tripId)
    navigator.serviceWorker?.addEventListener('controllerchange', resend)
    return () => {
      navigator.serviceWorker?.removeEventListener('controllerchange', resend)
      setActiveTripForOffline(null)
    }
  }, [tripId])
}
