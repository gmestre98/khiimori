import { useEffect, useRef } from 'react'
import { Link, Navigate, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import { UnauthorizedError, datesInRange, fetchTrips, type Trip } from '../lib/api'
import { shortDate } from '../lib/format'
import { useActiveTripOffline } from '../lib/activeTripSync'
import { useCachedResource } from '../lib/useCachedResource'
import { cacheKeys } from '../lib/cacheKeys'
import { CacheStatus } from '../components/CacheStatus'

// todayStr returns today's date as YYYY-MM-DD in local time.
function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// clampDate returns date if it falls within [start, end], otherwise the nearest
// boundary. Used to redirect deep links that land outside the trip's range.
function clampDate(date: string, start: string, end: string): string {
  if (date < start) return start
  if (date > end) return end
  return date
}

// TripShellRoute wraps TripShell with a key derived from the tripId param so
// React remounts TripShell whenever the user navigates to a different trip.
// This keeps TripShell's useState initializers correct without needing
// synchronous setState calls inside effects when the param changes.
export function TripShellRoute() {
  const { tripId } = useParams<{ tripId: string }>()
  return <TripShell key={tripId} />
}

// TripShell is the authenticated wrapper for a single trip. It resolves the trip
// (from router state if available, falling back to the trips listing), then
// redirects to today's day (or the nearest valid day). Child routes render via
// <Outlet> and receive the trip through the outlet context.
// TripShell is always mounted with a stable tripId (TripShellRoute provides the
// key), so useState initializers run once per trip.
function TripShell() {
  const { tripId, date: dateParam } = useParams<{ tripId: string; date?: string }>()
  const location = useLocation()
  // Trip may be passed via Link state (from the dashboard) to avoid a refetch.
  const stateTrip = (location.state as { trip?: Trip } | null)?.trip ?? null

  // Register this trip with the service worker so its API reads are cached for
  // offline viewing (M09.4 S3); leaving the trip clears the cache.
  useActiveTripOffline(tripId ?? null)

  // Resolve the trip from the user's trips list via the instant-render cache: a
  // previously-loaded trips list renders the name/dates immediately (no wait for
  // the backend cold start), then revalidates. Skip the fetch entirely when the
  // trip was handed over via Link state (navigated from the dashboard).
  const {
    data: trips,
    error: loadError,
    fromCache,
    isValidating,
  } = useCachedResource(stateTrip ? null : cacheKeys.trips(), (signal) => fetchTrips(signal))

  const trip =
    stateTrip ??
    (trips
      ? ([...trips.current, ...trips.upcoming, ...trips.past].find((t) => t.id === tripId) ?? null)
      : null)

  // Loading while the list hasn't resolved yet (and no Link-state trip); "not
  // found" only once the list has resolved without the trip. UnauthorizedError
  // is handled app-wide (central 401 handler → re-auth), so treat it as loading.
  const loading = !stateTrip && trips === null && loadError === null
  const notFound = trips !== null && !stateTrip && trip === null
  const error =
    loadError && !(loadError instanceof UnauthorizedError)
      ? 'Could not load trip.'
      : notFound
        ? 'Trip not found.'
        : null

  if (loading) {
    return (
      <p className="trip-shell-loading" aria-busy="true">
        Loading trip…
      </p>
    )
  }
  if (error || !trip) {
    return (
      <p role="alert" className="trip-shell-error">
        {error ?? 'Trip not found.'}
      </p>
    )
  }

  // If no day segment is matched and we're not on a named child route (e.g.
  // backlog), redirect to today's day (or nearest boundary).
  const isAtRoot =
    !dateParam &&
    !location.pathname.endsWith('/backlog') &&
    !location.pathname.endsWith('/plan') &&
    !location.pathname.endsWith('/map') &&
    !location.pathname.endsWith('/journal') &&
    !location.pathname.endsWith('/budget') &&
    !location.pathname.endsWith('/sharing')
  if (isAtRoot) {
    const today = todayStr()
    const target = clampDate(today, trip.start_date, trip.end_date)
    return <Navigate to={`/trips/${trip.id}/days/${target}`} replace state={{ trip }} />
  }

  const dates = datesInRange(trip.start_date, trip.end_date)

  return (
    <div className="trip-shell">
      <header className="topnav">
        <div className="trip-shell-crumbs">
          <Link to="/" className="trip-shell-back" aria-label="Back to trips">
            ← Trips
          </Link>
          <span className="trip-shell-sep">›</span>
          <h1 className="trip-shell-name">{trip.name}</h1>
          <CacheStatus fromCache={fromCache} isValidating={isValidating} />
          {trip.destinations.length > 0 && (
            <>
              <span className="trip-shell-sep trip-shell-sep--dest">·</span>
              <p className="trip-shell-destinations">{trip.destinations.join(', ')}</p>
            </>
          )}
        </div>
        <div className="row gap2 trip-shell-actions">
          <Link
            to={`/trips/${trip.id}/plan`}
            state={{ trip }}
            className="btn btn-ghost btn-sm"
            aria-label={`Days for ${trip.name}`}
          >
            Days
          </Link>
          <Link
            to={`/trips/${trip.id}/map`}
            state={{ trip }}
            className="btn btn-ghost btn-sm"
            aria-label={`Map for ${trip.name}`}
          >
            Map
          </Link>
          <Link
            to={`/trips/${trip.id}/budget`}
            state={{ trip }}
            className="btn btn-ghost btn-sm"
            aria-label={`Budget for ${trip.name}`}
          >
            Budget
          </Link>
          <Link
            to={`/trips/${trip.id}/sharing`}
            state={{ trip }}
            className="btn btn-ghost btn-sm"
            aria-label={`Sharing for ${trip.name}`}
          >
            Sharing
          </Link>
          <Link
            to={`/trips/${trip.id}/edit`}
            state={{ trip }}
            className="btn btn-ghost btn-sm"
            aria-label={`Edit ${trip.name}`}
          >
            Edit
          </Link>
        </div>
      </header>
      {/* Day selector strip — only on the day view, not budget/sharing/backlog */}
      {dateParam && <DayNav tripId={trip.id} dates={dates} trip={trip} />}
      {/* Outlet renders DayView; trip is passed via context */}
      <Outlet context={{ trip }} />
    </div>
  )
}

// weekdayAbbrev returns the 3-letter weekday for a YYYY-MM-DD date in local time.
function weekdayAbbrev(date: string): string {
  const d = new Date(date + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short' })
}

// DayNav renders a horizontal strip with prev/next buttons and a day selector
// that lets the user jump to any day in the trip.
function DayNav({ tripId, dates, trip }: { tripId: string; dates: string[]; trip: Trip }) {
  const { date } = useParams<{ date: string }>()
  const navigate = useNavigate()
  const currentIndex = date ? dates.indexOf(date) : -1
  const prevDate = currentIndex > 0 ? dates[currentIndex - 1] : null
  const nextDate = currentIndex < dates.length - 1 ? dates[currentIndex + 1] : null

  const dayLabel = (d: string) => {
    const idx = dates.indexOf(d)
    return idx >= 0 ? `Day ${idx + 1} · ${shortDate(d)}` : d
  }

  // Keep the active day pill in view when the day changes (matters on mobile,
  // where the pill strip scrolls horizontally).
  const activePillRef = useRef<HTMLAnchorElement | null>(null)
  useEffect(() => {
    activePillRef.current?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [date])

  return (
    <nav className="day-strip" aria-label="Day navigation">
      {prevDate ? (
        <Link
          to={`/trips/${tripId}/days/${prevDate}`}
          state={{ trip }}
          className="day-strip-arrow"
          aria-label={`Previous day: ${dayLabel(prevDate)}`}
        >
          ‹ Prev
        </Link>
      ) : (
        <span className="day-strip-arrow day-strip-arrow--disabled" aria-disabled="true">
          ‹ Prev
        </span>
      )}

      <div className="day-strip-pills">
        {dates.map((d, i) => (
          <Link
            key={d}
            ref={d === date ? activePillRef : undefined}
            to={`/trips/${tripId}/days/${d}`}
            state={{ trip }}
            className={['day-pill', d === date ? 'day-pill--active' : ''].filter(Boolean).join(' ')}
            aria-label={`Day ${i + 1}, ${d}`}
            aria-current={d === date ? 'page' : undefined}
          >
            <span className="day-pill-dow">{weekdayAbbrev(d)}</span>
            <span className="day-pill-num num">D{i + 1}</span>
          </Link>
        ))}
      </div>

      {nextDate ? (
        <Link
          to={`/trips/${tripId}/days/${nextDate}`}
          state={{ trip }}
          className="day-strip-arrow"
          aria-label={`Next day: ${dayLabel(nextDate)}`}
        >
          Next ›
        </Link>
      ) : (
        <span className="day-strip-arrow day-strip-arrow--disabled" aria-disabled="true">
          Next ›
        </span>
      )}

      <select
        className="day-strip-jump"
        value={date ?? ''}
        aria-label="Jump to day"
        onChange={(e) => {
          navigate(`/trips/${tripId}/days/${e.target.value}`, { state: { trip } })
        }}
      >
        {dates.map((d, i) => (
          <option key={d} value={d}>
            Day {i + 1} · {shortDate(d)}
          </option>
        ))}
      </select>
    </nav>
  )
}
