import { lazy, Suspense, useEffect, useState } from 'react'
import {
  datesInRange,
  fetchDay,
  fetchDayRoute,
  UnauthorizedError,
  type Day,
  type LatLng,
} from '../lib/api'
import { shortDate } from '../lib/format'
import { collectLocatedItems, type LocatedItem } from './locatedItems'
import { useTripShell } from './useTripShell'
import type { TripDayMarkers } from './TripMap'

const TripMap = lazy(() => import('./TripMap'))

// DAY_COLORS cycles per day index so each day's pins and route read as one group.
// Values come from the design palette (teal, blue, coral, amber, purple, pink).
const DAY_COLORS = ['#1d9e75', '#378add', '#d85a30', '#ba7517', '#7f77dd', '#d4537e']

function dayColor(index: number): string {
  return DAY_COLORS[index % DAY_COLORS.length]
}

// collectLocations mirrors DayMap: all stay + plan-item locations in the same
// order as collectLocatedItems, with empty strings for location-less entries
// (the geo proxy skips them so waypoints line up with the located items).
function collectLocations(day: Day): string[] {
  return [
    ...(day.stays ?? []).map((s) => s.location ?? ''),
    ...[...(day.plan_items ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((i) => i.location ?? ''),
  ]
}

// DayEntry is the per-day state the page tracks: the located items, the geocoded
// waypoints (once resolved), and a status used for the row's caption.
interface DayEntry {
  date: string
  index: number
  color: string
  items: LocatedItem[]
  waypoints: LatLng[]
  status: 'no-places' | 'ok' | 'unplaceable' | 'error'
}

// loadDay fetches one day and, when it has any location, geocodes its stops.
// Failures are folded into the entry's status rather than thrown so one bad day
// doesn't blank the whole trip map.
async function loadDay(
  tripId: string,
  date: string,
  index: number,
  signal: AbortSignal,
): Promise<DayEntry> {
  const base: DayEntry = {
    date,
    index,
    color: dayColor(index),
    items: [],
    waypoints: [],
    status: 'no-places',
  }
  const day = await fetchDay(tripId, date, signal)
  const items = collectLocatedItems(day)
  const locations = collectLocations(day)
  if (!locations.some((l) => l !== '')) return { ...base, items, status: 'no-places' }
  try {
    const { waypoints } = await fetchDayRoute(locations, signal)
    return {
      ...base,
      items,
      waypoints,
      status: waypoints.length === 0 ? 'unplaceable' : 'ok',
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    if (err instanceof UnauthorizedError) throw err
    return { ...base, items, status: 'error' }
  }
}

// dayCaption returns the muted helper line shown under a day row.
function dayCaption(entry: DayEntry): string {
  switch (entry.status) {
    case 'no-places':
      return 'No places yet'
    case 'unplaceable':
      return 'Couldn’t place this day’s locations'
    case 'error':
      return 'Couldn’t load positions'
    default: {
      const n = entry.waypoints.length
      return `${n} ${n === 1 ? 'place' : 'places'}`
    }
  }
}

// TripMapPage is the trip-scoped Map subtab (/trips/:tripId/map). Unlike the day
// view's per-day map facet, this is a whole-trip, read-only orientation: one
// overview map with every day's stops colour-coded, plus a day list that focuses
// the map on a single day. It loads each day + its route once on mount.
export function TripMapPage() {
  const { trip } = useTripShell()
  const dates = datesInRange(trip.start_date, trip.end_date)

  const [entries, setEntries] = useState<DayEntry[] | null>(null)
  const [error, setError] = useState(false)
  // focusedDate narrows the map to one day (null = whole trip). selectedId is the
  // highlighted pin, shared between the map and the day list.
  const [focusedDate, setFocusedDate] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    Promise.all(dates.map((d, i) => loadDay(trip.id, d, i, controller.signal)))
      .then((loaded) => {
        if (controller.signal.aborted) return
        setEntries(loaded)
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        if (err instanceof UnauthorizedError) return
        setError(true)
      })
    return () => controller.abort()
    // trip.id is stable (TripShell remounts per trip); dates derive from it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip.id])

  // Days with resolved waypoints are the only ones the map draws.
  const mapDays: TripDayMarkers[] = (entries ?? [])
    .filter((e) => e.waypoints.length > 0)
    .map((e) => ({
      date: e.date,
      index: e.index,
      color: e.color,
      items: e.items,
      waypoints: e.waypoints,
    }))
  const hasAnyPlace = mapDays.length > 0

  const toggleFocus = (date: string) => {
    setFocusedDate((cur) => (cur === date ? null : date))
    setSelectedId(null)
  }

  return (
    <section className="trip-map-page" aria-label={`Map for ${trip.name}`}>
      <header className="trip-map-page-header">
        <h2 className="trip-map-page-title">Trip map</h2>
        <p className="trip-map-page-sub">Every day’s places on one map. Pick a day to focus it.</p>
      </header>

      {error ? (
        <p role="alert" className="trip-map-error">
          Could not load the trip map.
        </p>
      ) : entries === null ? (
        <p className="trip-map-loading" aria-busy="true">
          Loading trip map…
        </p>
      ) : (
        <div className="trip-map-layout">
          <nav className="trip-map-days" aria-label="Days">
            <button
              type="button"
              className={['trip-map-day', focusedDate === null ? 'trip-map-day--active' : '']
                .filter(Boolean)
                .join(' ')}
              aria-pressed={focusedDate === null}
              onClick={() => {
                setFocusedDate(null)
                setSelectedId(null)
              }}
            >
              <span className="trip-map-day-dot trip-map-day-dot--all" aria-hidden="true" />
              <span className="trip-map-day-label">All days</span>
              <span className="trip-map-day-meta">Whole trip</span>
            </button>
            {entries.map((e) => (
              <button
                key={e.date}
                type="button"
                className={['trip-map-day', focusedDate === e.date ? 'trip-map-day--active' : '']
                  .filter(Boolean)
                  .join(' ')}
                aria-pressed={focusedDate === e.date}
                disabled={e.waypoints.length === 0}
                onClick={() => toggleFocus(e.date)}
              >
                <span
                  className="trip-map-day-dot"
                  style={{ background: e.color }}
                  aria-hidden="true"
                />
                <span className="trip-map-day-label">
                  Day {e.index + 1} · {shortDate(e.date)}
                </span>
                <span className="trip-map-day-meta">{dayCaption(e)}</span>
              </button>
            ))}
          </nav>

          <div className="trip-map-panel">
            <Suspense
              fallback={
                <p className="trip-map-loading" aria-busy="true">
                  Loading map…
                </p>
              }
            >
              <TripMap
                days={mapDays}
                focusedDate={focusedDate}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            </Suspense>
            {!hasAnyPlace && (
              <p className="trip-map-caption">
                No places yet. Add a location to a stay or activity and its pin appears here.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
