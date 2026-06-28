import { useEffect, useState } from 'react'
import { UnauthorizedError, fetchTrips, type Trip, type TripsResponse } from './api'

// pickActiveTrip resolves the single trip the app's trip-scoped navigation should
// open by default: the live current trip if there is one, otherwise the nearest
// upcoming trip, otherwise the most recent past trip. Returns null when the user
// has no trips at all.
export function pickActiveTrip(data: TripsResponse): Trip | null {
  return (
    data.current.find((t) => t.is_current) ??
    data.current[0] ??
    data.upcoming[0] ??
    data.past[0] ??
    null
  )
}

// useActiveTrip fetches the user's trips once and returns the resolved active
// trip (see pickActiveTrip). Used by the app chrome so that Map / Journal /
// Budget / Sharing navigation lands inside the current trip rather than the
// trips dashboard. Fails silently (returns null) — navigation falls back to the
// dashboard, where the authoritative trip list is shown.
export function useActiveTrip(): Trip | null {
  const [trip, setTrip] = useState<Trip | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetchTrips(controller.signal)
      .then((data) => setTrip(pickActiveTrip(data)))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        if (err instanceof UnauthorizedError) return
        // Leave trip null; trip-scoped nav falls back to the dashboard.
      })
    return () => controller.abort()
  }, [])

  return trip
}
