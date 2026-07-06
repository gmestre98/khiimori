import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  UnauthorizedError,
  fetchBudgetRollup,
  fetchTrips,
  archiveTrip,
  deleteTrip,
  type BudgetRollup,
  type Trip,
  type TripsResponse,
} from '../lib/api'
import { CurrentTripCard } from './CurrentTripCard'
import { ConfirmModal } from '../components/ConfirmModal'
import { BudgetGlance } from './RollupDisplay'
import { formatDateRange, monthYear, tripDayCount } from '../lib/format'
import { readCache, writeCache } from '../lib/resourceCache'
import { cacheKeys } from '../lib/cacheKeys'
import { CacheStatus } from '../components/CacheStatus'

type Tab = 'current' | 'past'
type PendingAction = { type: 'archive' | 'delete'; trip: Trip }

// daysUntil returns whole days from today to an ISO date (negative if past).
function daysUntil(iso: string): number {
  const target = new Date(iso + 'T00:00:00').getTime()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((target - today.getTime()) / 86_400_000)
}

// PlusIcon — inline SVG for the "New trip" button
function PlusIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

// TripCard renders an upcoming/past trip echoing the current-trip hero: a small
// colour panel (status + length) beside the trip's name, dates and quiet actions.
// `featured` stretches it across the full row (used for the lead trip when there
// is no current trip).
function TripCard({
  trip,
  isPast,
  featured,
  onArchive,
  onDelete,
}: {
  trip: Trip
  isPast?: boolean
  featured?: boolean
  onArchive?: (trip: Trip) => void
  onDelete: (trip: Trip) => void
}) {
  const destinations = trip.destinations.join(' · ')
  const days = tripDayCount(trip.start_date, trip.end_date)
  const until = daysUntil(trip.start_date)
  const dayLabel = `${days} ${days === 1 ? 'day' : 'days'}`

  // Panel copy mirrors the hero's "Now / Day N" — a status eyebrow over a figure.
  const panelTop = isPast ? 'Journal' : until <= 0 ? 'Now' : until <= 30 ? 'Soon' : 'Planning'
  const panelBottom = isPast ? monthYear(trip.start_date) : dayLabel
  const dateLine = isPast
    ? `${monthYear(trip.start_date)} · ${dayLabel}`
    : formatDateRange(trip.start_date, trip.end_date)

  return (
    <article
      className={[
        'trip-card',
        featured ? 'trip-card--featured' : '',
        isPast ? 'trip-card--past' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Stretched link — the whole card opens the trip; actions are raised above it. */}
      <Link
        to={`/trips/${trip.id}`}
        state={{ trip }}
        className="trip-card-stretch-link"
        aria-label={`Open ${trip.name}`}
      />
      <div className="trip-card-inner">
        <div
          className={['trip-card-panel', isPast ? 'trip-card-panel--past' : '']
            .filter(Boolean)
            .join(' ')}
          aria-hidden="true"
        >
          <div className="trip-card-panel-glow" />
          <div className="trip-card-panel-label">
            <div className="trip-card-panel-now">{panelTop}</div>
            <div className="trip-card-panel-day">{panelBottom}</div>
          </div>
        </div>
        <div className="trip-card-body">
          <div className="trip-card-body-main">
            <h3 className="trip-card-name">{trip.name}</h3>
            {destinations && <p className="trip-card-destinations">{destinations}</p>}
            <p className="trip-card-dates num">{dateLine}</p>
          </div>
          <div className="trip-card-actions">
            <Link
              to={`/trips/${trip.id}/edit`}
              state={{ trip }}
              className="trip-card-action"
              aria-label={`Edit ${trip.name}`}
            >
              Edit
            </Link>
            {onArchive && (
              <button
                type="button"
                className="trip-card-action"
                onClick={() => onArchive(trip)}
                aria-label={`Archive ${trip.name}`}
              >
                Archive
              </button>
            )}
            <button
              type="button"
              className="trip-card-action trip-card-action--danger"
              onClick={() => onDelete(trip)}
              aria-label={`Delete ${trip.name}`}
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </article>
  )
}

function removeTripFromData(data: TripsResponse, id: string): TripsResponse {
  return {
    current: data.current.filter((t) => t.id !== id),
    upcoming: data.upcoming.filter((t) => t.id !== id),
    past: data.past.filter((t) => t.id !== id),
  }
}

export function TripsDashboard() {
  const [data, setData] = useState<TripsResponse | null>(null)
  const [archived, setArchived] = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [currentRollup, setCurrentRollup] = useState<BudgetRollup | null>(null)
  const [tab, setTab] = useState<Tab>('current')
  // Instant-render cache state (M11.1 S2): true while showing the cached trips
  // list and while a background refresh runs — drives the subtle "Updating…"
  // hint so the dashboard never blocks on the backend cold start.
  const [fromCache, setFromCache] = useState(false)
  const [validating, setValidating] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    let done = false
    const key = cacheKeys.trips()

    // Fetch the current trip's budget roll-up (best-effort, non-blocking).
    const loadRollup = (trips: TripsResponse) => {
      const current = trips.current.find((t) => t.is_current)
      if (!current) return
      fetchBudgetRollup(current.id, controller.signal)
        .then((r) => {
          if (!done) setCurrentRollup(r)
        })
        .catch(() => {})
    }

    // Instant-render: paint the cached trips list first (no spinner on cold
    // start), then revalidate. A failed refresh keeps the cached list on screen.
    void readCache<TripsResponse>(key).then((cached) => {
      if (done) return
      if (cached) {
        setData(cached.data)
        setLoading(false)
        setFromCache(true)
        loadRollup(cached.data)
      }
      setValidating(true)
      return fetchTrips(controller.signal).then(
        (trips) => {
          if (done) return
          setData(trips)
          setLoading(false)
          setFromCache(false)
          setValidating(false)
          void writeCache(key, trips)
          loadRollup(trips)
        },
        (err: unknown) => {
          if (done) return
          setValidating(false)
          if (err instanceof DOMException && err.name === 'AbortError') {
            setLoading(false)
            return
          }
          if (err instanceof UnauthorizedError) return
          if (!cached) {
            setError('Could not load trips. Please try again.')
            setLoading(false)
          }
        },
      )
    })

    return () => {
      done = true
      controller.abort()
    }
  }, [])

  const handleCancel = useCallback(() => setPending(null), [])

  async function handleConfirm() {
    if (!pending || !data) return
    const { type, trip } = pending
    setPending(null)
    setActionError(null)

    try {
      if (type === 'archive') {
        await archiveTrip(trip.id)
        const next = removeTripFromData(data, trip.id)
        setData(next)
        void writeCache(cacheKeys.trips(), next)
        setArchived((prev) => [trip, ...prev])
      } else {
        await deleteTrip(trip.id)
        const next = removeTripFromData(data, trip.id)
        setData(next)
        void writeCache(cacheKeys.trips(), next)
        setArchived((prev) => prev.filter((t) => t.id !== trip.id))
      }
    } catch {
      setActionError(
        type === 'archive'
          ? `Could not archive "${trip.name}". Please try again.`
          : `Could not delete "${trip.name}". Please try again.`,
      )
    }
  }

  const currentTrip = data?.current.find((t) => t.is_current) ?? null
  // Current & Upcoming pool, in soonest-first order. The lead trip sits on its
  // own full-width row (the current trip's hero, or — with no current trip — the
  // next upcoming trip promoted to the top); the rest fill the 2-up grid below.
  const currentPool = data ? [...data.current, ...data.upcoming] : []
  const leadTrip = currentTrip ?? currentPool[0] ?? null
  const restTrips = leadTrip ? currentPool.filter((t) => t.id !== leadTrip.id) : currentPool
  const totalCount = data
    ? data.current.length + data.upcoming.length + data.past.length + archived.length
    : 0

  return (
    <>
      {pending?.type === 'archive' && (
        <ConfirmModal
          title="Archive trip"
          message={`Archive "${pending.trip.name}"? It will move to your archive.`}
          confirmLabel="Archive"
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
      {pending?.type === 'delete' && (
        <ConfirmModal
          title="Delete trip"
          message={`Permanently delete "${pending.trip.name}"? This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={handleConfirm}
          onCancel={handleCancel}
          danger
        />
      )}

      {/* Top nav bar */}
      <div className="trips-dashboard-topnav">
        <div className="trips-dashboard-crumbs">
          My trips
          <CacheStatus fromCache={fromCache} isValidating={validating} />
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Link to="/trips/new" className="btn-primary trips-new-btn">
            <PlusIcon /> New trip
          </Link>
        </div>
      </div>

      <div className="trips-dashboard">
        {actionError && (
          <p role="alert" className="trips-error">
            {actionError}
          </p>
        )}

        {/* Tab bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 'var(--s6)',
          }}
        >
          <div className="trips-tabs" role="tablist">
            {(['current', 'past'] as Tab[]).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                className={['trips-tabs-btn', tab === t ? 'trips-tabs-btn--active' : '']
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => setTab(t)}
              >
                {t === 'current' ? 'Current & Upcoming' : 'Past'}
              </button>
            ))}
          </div>
          {data && (
            <span className="trips-tab-meta">
              {totalCount} {totalCount === 1 ? 'trip' : 'trips'}
            </span>
          )}
        </div>

        {/* Loading / error states */}
        {loading && (
          <p className="trips-loading" aria-busy="true">
            Loading trips…
          </p>
        )}
        {error && (
          <p role="alert" className="trips-error">
            {error}
          </p>
        )}

        {/* Tab content */}
        {!loading && !error && data && (
          <>
            {tab === 'current' && (
              <>
                {/* Lead trip — the current-trip hero, or (with no current trip) the
                    next upcoming trip promoted to its own full-width row. */}
                {currentTrip ? (
                  <CurrentTripCard
                    trip={currentTrip}
                    budgetGlance={
                      currentRollup ? <BudgetGlance rollup={currentRollup} /> : undefined
                    }
                    onArchive={() => setPending({ type: 'archive', trip: currentTrip })}
                    onDelete={() => setPending({ type: 'delete', trip: currentTrip })}
                  />
                ) : leadTrip ? (
                  <TripCard
                    trip={leadTrip}
                    featured
                    onArchive={(trip) => setPending({ type: 'archive', trip })}
                    onDelete={(trip) => setPending({ type: 'delete', trip })}
                  />
                ) : (
                  <p className="trips-empty">
                    No current trip.{' '}
                    <Link to="/trips/new" style={{ color: 'var(--accent)' }}>
                      Plan one →
                    </Link>
                  </p>
                )}

                {/* Upcoming — the remaining trips, 2 to a row below the lead. */}
                <section className="trips-section" aria-label="Upcoming trips">
                  <h2 className="trips-section-title">Upcoming</h2>
                  {restTrips.length === 0 ? (
                    <p className="trips-empty">
                      No upcoming trips.{' '}
                      <Link to="/trips/new" style={{ color: 'var(--accent)' }}>
                        Plan one →
                      </Link>
                    </p>
                  ) : (
                    <div className="trips-grid">
                      {restTrips.map((t) => (
                        <TripCard
                          key={t.id}
                          trip={t}
                          onArchive={(trip) => setPending({ type: 'archive', trip })}
                          onDelete={(trip) => setPending({ type: 'delete', trip })}
                        />
                      ))}
                    </div>
                  )}
                </section>
              </>
            )}

            {tab === 'past' && (
              <>
                {data.past.length === 0 && archived.length === 0 ? (
                  <p className="trips-empty">No past trips yet.</p>
                ) : (
                  <div className="trips-grid">
                    {[...data.past, ...archived].map((t) => (
                      <TripCard
                        key={t.id}
                        trip={t}
                        isPast
                        onDelete={(trip) => setPending({ type: 'delete', trip })}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </>
  )
}
