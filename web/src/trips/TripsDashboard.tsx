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

type Tab = 'current' | 'past'
type PendingAction = { type: 'archive' | 'delete'; trip: Trip }

// daysUntil returns whole days from today to an ISO date (negative if past).
function daysUntil(iso: string): number {
  const target = new Date(iso + 'T00:00:00').getTime()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((target - today.getTime()) / 86_400_000)
}

// CheckIcon — the small "journal complete" tick on past trips (design §04).
function CheckIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ color: 'var(--accent)' }}
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
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

// TripCard renders an upcoming/past trip as a calm card
function TripCard({
  trip,
  isPast,
  onArchive,
  onDelete,
}: {
  trip: Trip
  isPast?: boolean
  onArchive?: (trip: Trip) => void
  onDelete: (trip: Trip) => void
}) {
  const destinations = trip.destinations.join(' · ')
  const days = tripDayCount(trip.start_date, trip.end_date)
  const until = daysUntil(trip.start_date)
  const pastMeta = `${monthYear(trip.start_date)} · ${days} days`

  return (
    <article className={['trip-card', isPast ? 'trip-card--past' : ''].filter(Boolean).join(' ')}>
      {/* The whole card opens the trip; quiet actions sit below (design §04). */}
      <Link
        to={`/trips/${trip.id}`}
        state={{ trip }}
        className="trip-card-link"
        aria-label={`Open ${trip.name}`}
      >
        <div className="trip-card-header">
          <h3 className="trip-card-name">{trip.name}</h3>
          {isPast ? (
            <span className="chip chip--accent" style={{ gap: 4 }}>
              <CheckIcon /> journal
            </span>
          ) : (
            <span className={until <= 30 ? 'chip' : 'chip chip--outline'}>
              {until <= 0 ? 'now' : until <= 30 ? `in ${until} days` : 'planning'}
            </span>
          )}
        </div>
        {destinations && <p className="trip-card-destinations">{destinations}</p>}
        <div className="trip-card-footer">
          <p className="trip-card-dates num">
            {isPast ? pastMeta : formatDateRange(trip.start_date, trip.end_date)}
          </p>
        </div>
      </Link>
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

  useEffect(() => {
    const controller = new AbortController()

    fetchTrips(controller.signal)
      .then((trips) => {
        setData(trips)
        setLoading(false)
        const current = trips.current.find((t) => t.is_current)
        if (current) {
          fetchBudgetRollup(current.id, controller.signal)
            .then((r) => setCurrentRollup(r))
            .catch(() => {})
        }
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') {
          setLoading(false)
          return
        }
        if (err instanceof UnauthorizedError) return
        setError('Could not load trips. Please try again.')
        setLoading(false)
      })

    return () => controller.abort()
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
        setData(removeTripFromData(data, trip.id))
        setArchived((prev) => [trip, ...prev])
      } else {
        await deleteTrip(trip.id)
        setData(removeTripFromData(data, trip.id))
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
        <div className="trips-dashboard-crumbs">My Trips</div>
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
                {/* Current trip — hero, or the calmer cards / empty state */}
                {currentTrip ? (
                  <CurrentTripCard
                    trip={currentTrip}
                    budgetGlance={
                      currentRollup ? <BudgetGlance rollup={currentRollup} /> : undefined
                    }
                    onArchive={() => setPending({ type: 'archive', trip: currentTrip })}
                    onDelete={() => setPending({ type: 'delete', trip: currentTrip })}
                  />
                ) : data.current.length > 0 ? (
                  <div className="trips-grid">
                    {data.current.map((t) => (
                      <TripCard
                        key={t.id}
                        trip={t}
                        onArchive={(trip) => setPending({ type: 'archive', trip })}
                        onDelete={(trip) => setPending({ type: 'delete', trip })}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="trips-empty">
                    No current trip.{' '}
                    <Link to="/trips/new" style={{ color: 'var(--accent)' }}>
                      Plan one →
                    </Link>
                  </p>
                )}

                {/* Upcoming — stacked below the current trip */}
                <section className="trips-section" aria-label="Upcoming trips">
                  <h2 className="trips-section-title">Upcoming</h2>
                  {data.upcoming.length === 0 ? (
                    <p className="trips-empty">
                      No upcoming trips.{' '}
                      <Link to="/trips/new" style={{ color: 'var(--accent)' }}>
                        Plan one →
                      </Link>
                    </p>
                  ) : (
                    <div className="trips-grid">
                      {data.upcoming.map((t) => (
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
