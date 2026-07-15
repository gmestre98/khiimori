import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { datesInRange, fetchDay, UnauthorizedError, type LatLng } from '../lib/api'
import { loadDayRoute } from '../lib/dayRouteCache'
import { shortDate } from '../lib/format'
import { collectLocatedItems, collectLocations, type LocatedItem } from './locatedItems'
import { useTripShell } from './useTripShell'
import type { TripDayMarkers } from './TripMap'

const TripMap = lazy(() => import('./TripMap'))

// DAY_COLORS cycles per day index so each day's pins and route read as one group.
// Values come from the design palette (teal, blue, coral, amber, purple, pink).
const DAY_COLORS = ['#1d9e75', '#378add', '#d85a30', '#ba7517', '#7f77dd', '#d4537e']

function dayColor(index: number): string {
  return DAY_COLORS[index % DAY_COLORS.length]
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
  if (locations.length === 0) return { ...base, items, status: 'no-places' }
  try {
    // Network-first with an offline fallback to cached waypoints (dayRouteCache).
    const waypoints = await loadDayRoute(tripId, date, locations, signal)
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
// overview map with every day's stops colour-coded, plus a day list that lets you
// toggle any subset of days to focus the map on them. It loads each day + its
// route once on mount.
export function TripMapPage() {
  const { trip } = useTripShell()
  const dates = datesInRange(trip.start_date, trip.end_date)

  const [entries, setEntries] = useState<DayEntry[] | null>(null)
  const [error, setError] = useState(false)
  // selectedDates narrows the map to a subset of days; an empty set means "all
  // days" (the whole trip). selectedId is the highlighted pin, shared between the
  // map and the day list.
  const [selectedDates, setSelectedDates] = useState<Set<string>>(() => new Set())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // hideNotHappened drops pins for things that didn't happen (not done), leaving
  // only what actually took place — a cleaner read of a past trip.
  const [hideNotHappened, setHideNotHappened] = useState(false)

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

  // Days with resolved waypoints are the only ones the map draws. Memoized so
  // the array reference is stable across re-renders that don't change the loaded
  // days (e.g. selecting a pin) — otherwise TripMap's fit-bounds effect would
  // refire and yank the map view back on every selection.
  const mapDays: TripDayMarkers[] = useMemo(
    () =>
      (entries ?? [])
        .filter((e) => e.waypoints.length > 0)
        .map((e) => ({
          date: e.date,
          index: e.index,
          color: e.color,
          items: e.items,
          waypoints: e.waypoints,
        })),
    [entries],
  )
  const hasAnyPlace = mapDays.length > 0

  // When hiding what didn't happen, keep only done pins per day — filtering items
  // and waypoints together so they stay positionally aligned — and drop days left
  // with nothing to draw.
  const shownDays: TripDayMarkers[] = useMemo(() => {
    if (!hideNotHappened) return mapDays
    return mapDays
      .map((d) => {
        // Iterate the waypoints (the drawn set) so we never index past them when
        // a day has more located items than placeable waypoints; items[j] is the
        // label for waypoint j.
        const keep = d.waypoints.map((_, j) => (d.items[j]?.done ? j : -1)).filter((j) => j >= 0)
        return {
          ...d,
          items: keep.map((j) => d.items[j]),
          waypoints: keep.map((j) => d.waypoints[j]),
        }
      })
      .filter((d) => d.waypoints.length > 0)
  }, [mapDays, hideNotHappened])
  // A pin exists but everything shown got hidden — tell the user why the map is empty.
  const allHidden = hasAnyPlace && shownDays.length === 0

  // Toggle a day in/out of the selection. An empty selection means "all days".
  const toggleDay = (date: string) => {
    setSelectedDates((cur) => {
      const next = new Set(cur)
      if (next.has(date)) next.delete(date)
      else next.add(date)
      return next
    })
    setSelectedId(null)
  }
  const showAllDays = () => {
    setSelectedDates(new Set())
    setSelectedId(null)
  }

  return (
    <article className="trip-map-page" aria-label={`Map for ${trip.name}`}>
      <div className="screen-content trip-map-body">
        <header className="trip-map-head">
          <h1 className="h1">Trip map</h1>
          <p className="meta">Every day’s places on one map. Toggle days to compare a few.</p>
          <button
            type="button"
            className="trip-map-toggle"
            aria-pressed={hideNotHappened}
            onClick={() => setHideNotHappened((h) => !h)}
          >
            {hideNotHappened ? 'Show what didn’t happen' : 'Hide what didn’t happen'}
          </button>
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
                className={['trip-map-day', selectedDates.size === 0 ? 'trip-map-day--active' : '']
                  .filter(Boolean)
                  .join(' ')}
                aria-pressed={selectedDates.size === 0}
                onClick={showAllDays}
              >
                <span className="trip-map-day-dot trip-map-day-dot--all" aria-hidden="true" />
                <span className="trip-map-day-label">All days</span>
                <span className="trip-map-day-meta">Whole trip</span>
              </button>
              {entries.map((e) => (
                <button
                  key={e.date}
                  type="button"
                  className={[
                    'trip-map-day',
                    selectedDates.has(e.date) ? 'trip-map-day--active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-pressed={selectedDates.has(e.date)}
                  disabled={e.waypoints.length === 0}
                  onClick={() => toggleDay(e.date)}
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
                  days={shownDays}
                  selectedDates={selectedDates}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                />
              </Suspense>
              {!hasAnyPlace && (
                <p className="trip-map-caption">
                  No places yet. Add a location to a stay or activity and its pin appears here.
                </p>
              )}
              {allHidden && (
                <p className="trip-map-caption">
                  Nothing here happened yet. Turn off “Hide what didn’t happen” to see the plan.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </article>
  )
}
