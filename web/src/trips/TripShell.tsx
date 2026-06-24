import { useEffect, useState } from 'react'
import { Link, Navigate, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import { UnauthorizedError, datesInRange, fetchTrips, type Trip } from '../lib/api'

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

  const [trip, setTrip] = useState<Trip | null>(stateTrip)
  const [loading, setLoading] = useState(stateTrip === null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // stateTrip was already used to initialize state above — skip the fetch.
    if (stateTrip) return
    const controller = new AbortController()
    fetchTrips(controller.signal)
      .then((data) => {
        const all = [...data.current, ...data.upcoming, ...data.past]
        const found = all.find((t) => t.id === tripId) ?? null
        if (!found) {
          setError('Trip not found.')
        } else {
          setTrip(found)
        }
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        if (err instanceof UnauthorizedError) return
        setError('Could not load trip.')
        setLoading(false)
      })
    return () => controller.abort()
    // tripId is stable per mount (TripShellRoute's key remounts on tripId change).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
  const isAtRoot = !dateParam && !location.pathname.endsWith('/backlog')
  if (isAtRoot) {
    const today = todayStr()
    const target = clampDate(today, trip.start_date, trip.end_date)
    return <Navigate to={`/trips/${trip.id}/days/${target}`} replace state={{ trip }} />
  }

  const dates = datesInRange(trip.start_date, trip.end_date)

  return (
    <div className="trip-shell">
      <header className="trip-shell-header">
        <Link to="/" className="trip-shell-back" aria-label="Back to trips">
          ← Trips
        </Link>
        <div className="trip-shell-title">
          <h1 className="trip-shell-name">{trip.name}</h1>
          {trip.destinations.length > 0 && (
            <p className="trip-shell-destinations">{trip.destinations.join(', ')}</p>
          )}
        </div>
        <Link
          to={`/trips/${trip.id}/edit`}
          state={{ trip }}
          className="trip-card-edit-link"
          aria-label={`Edit ${trip.name}`}
        >
          Edit
        </Link>
      </header>
      {/* Day navigation strip */}
      <DayNav tripId={trip.id} dates={dates} trip={trip} />
      {/* Outlet renders DayView; trip is passed via context */}
      <Outlet context={{ trip }} />
    </div>
  )
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
    return idx >= 0 ? `Day ${idx + 1} · ${d}` : d
  }

  return (
    <nav className="day-nav" aria-label="Day navigation">
      {prevDate ? (
        <Link
          to={`/trips/${tripId}/days/${prevDate}`}
          state={{ trip }}
          className="day-nav-prev"
          aria-label={`Previous day: ${dayLabel(prevDate)}`}
        >
          ‹ Prev
        </Link>
      ) : (
        <span className="day-nav-prev day-nav-disabled" aria-disabled="true">
          ‹ Prev
        </span>
      )}

      <select
        className="day-nav-select"
        value={date ?? ''}
        aria-label="Jump to day"
        onChange={(e) => {
          navigate(`/trips/${tripId}/days/${e.target.value}`, { state: { trip } })
        }}
      >
        {dates.map((d, i) => (
          <option key={d} value={d}>
            Day {i + 1} · {d}
          </option>
        ))}
      </select>

      {nextDate ? (
        <Link
          to={`/trips/${tripId}/days/${nextDate}`}
          state={{ trip }}
          className="day-nav-next"
          aria-label={`Next day: ${dayLabel(nextDate)}`}
        >
          Next ›
        </Link>
      ) : (
        <span className="day-nav-next day-nav-disabled" aria-disabled="true">
          Next ›
        </span>
      )}
    </nav>
  )
}
