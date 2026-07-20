import { useCallback, useEffect, useState } from 'react'
import { UnauthorizedError, fetchTrips, type Trip, type TripsResponse } from './api'
import { pickActiveTrip } from './useActiveTrip'

// Where the sidebar trip-switcher remembers the user's last explicit choice, so
// the "Trip · …" tab keeps showing it across navigation and reloads until they
// pick another (or that trip disappears, in which case we fall back to the
// default pick — the current/next trip).
const STORAGE_KEY = 'khiimori.selectedTripId'

function readStoredId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function writeStoredId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // Ignore (private mode / storage disabled) — selection just isn't remembered.
  }
}

export interface TripSwitcher {
  /** All of the user's trips, bucketed as returned by GET /trips (null until loaded). */
  trips: TripsResponse | null
  /** The trip the sidebar tab currently points at, or null when the user has none. */
  selectedTrip: Trip | null
  /** Select a trip by id (persists the choice). Unknown ids are ignored. */
  selectTrip: (id: string) => void
}

// useSelectedTrip fetches the user's trips once and resolves the "selected" trip
// that drives the sidebar Trip tab (and the trip-scoped Map / Journal / Budget /
// Sharing links). The selection is the user's last explicit pick when that trip
// still exists, otherwise the default active trip (see pickActiveTrip). Fails
// silently — with no trips the switcher renders nothing.
//
// `routeTripId` — when the user is actually viewing a trip page (`/trips/:id/…`),
// the caller passes that id so the selection follows the URL. Without this,
// opening a trip from the dashboard (a plain <Link>, not selectTrip) would leave
// the sidebar's trip-scoped tabs pointing at the previously-picked trip, so the
// Map / Journal / Budget tabs would jump back to it.
export function useSelectedTrip(routeTripId?: string | null): TripSwitcher {
  const [trips, setTrips] = useState<TripsResponse | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(() => readStoredId())

  useEffect(() => {
    const controller = new AbortController()
    fetchTrips(controller.signal)
      .then((data) => setTrips(data))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        if (err instanceof UnauthorizedError) return
        // Leave trips null; the switcher hides and trip-scoped nav falls back to
        // the dashboard.
      })
    return () => controller.abort()
  }, [])

  // Viewing a trip page is an implicit selection: keep the stored pick in sync
  // with the trip in the URL so navigating into a trip updates the sidebar tabs.
  useEffect(() => {
    if (routeTripId && routeTripId !== selectedId) {
      setSelectedId(routeTripId)
      writeStoredId(routeTripId)
    }
  }, [routeTripId, selectedId])

  const selectTrip = useCallback((id: string) => {
    setSelectedId(id)
    writeStoredId(id)
  }, [])

  let selectedTrip: Trip | null = null
  if (trips) {
    const all = [...trips.current, ...trips.upcoming, ...trips.past]
    const chosen = selectedId ? (all.find((t) => t.id === selectedId) ?? null) : null
    selectedTrip = chosen ?? pickActiveTrip(trips)
  }

  return { trips, selectedTrip, selectTrip }
}
