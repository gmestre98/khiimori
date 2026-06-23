import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  UnauthorizedError,
  fetchTrips,
  archiveTrip,
  deleteTrip,
  type Trip,
  type TripsResponse,
} from '../lib/api'
import { CurrentTripCard } from './CurrentTripCard'
import { ConfirmModal } from '../components/ConfirmModal'

type PendingAction = { type: 'archive' | 'delete'; trip: Trip }

// TripCard renders a single trip's summary with Edit, Archive, and Delete controls.
// Authorization is server-side scoped — only trips the user owns or is a member
// of appear (PRD §5.9); the server enforces the owner-only constraint on mutation.
function TripCard({
  trip,
  onArchive,
  onDelete,
}: {
  trip: Trip
  onArchive: (trip: Trip) => void
  onDelete: (trip: Trip) => void
}) {
  const dateRange = `${trip.start_date} – ${trip.end_date}`
  const destinations = trip.destinations.join(', ')

  return (
    <article className="trip-card">
      {trip.cover && <img src={trip.cover} alt="" className="trip-card-cover" aria-hidden="true" />}
      <div className="trip-card-body">
        <h3 className="trip-card-name">{trip.name}</h3>
        {destinations && <p className="trip-card-destinations">{destinations}</p>}
        <p className="trip-card-dates">{dateRange}</p>
        <div className="trip-card-actions">
          <Link
            to={`/trips/${trip.id}/edit`}
            state={{ trip }}
            className="trip-card-edit-link"
            aria-label={`Edit ${trip.name}`}
          >
            Edit
          </Link>
          <button
            className="btn-ghost"
            onClick={() => onArchive(trip)}
            aria-label={`Archive ${trip.name}`}
          >
            Archive
          </button>
          <button
            className="btn-ghost-danger"
            onClick={() => onDelete(trip)}
            aria-label={`Delete ${trip.name}`}
          >
            Delete
          </button>
        </div>
      </div>
    </article>
  )
}

// BucketSection renders a labelled bucket (Current / Upcoming / Past / Archived)
// with its trips or an empty-state message when there are none.
function BucketSection({
  title,
  trips,
  emptyLabel,
  onArchive,
  onDelete,
}: {
  title: string
  trips: Trip[]
  emptyLabel: string
  onArchive: (trip: Trip) => void
  onDelete: (trip: Trip) => void
}) {
  return (
    <section className="trips-bucket" aria-label={title}>
      <h2 className="trips-bucket-title">{title}</h2>
      {trips.length === 0 ? (
        <p className="trips-empty">{emptyLabel}</p>
      ) : (
        <ul className="trips-list" role="list">
          {trips.map((t) => (
            <li key={t.id}>
              <TripCard trip={t} onArchive={onArchive} onDelete={onDelete} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// removeTripFromData removes a trip from all buckets in TripsResponse.
function removeTripFromData(data: TripsResponse, id: string): TripsResponse {
  return {
    current: data.current.filter((t) => t.id !== id),
    upcoming: data.upcoming.filter((t) => t.id !== id),
    past: data.past.filter((t) => t.id !== id),
  }
}

// TripsDashboard fetches and renders the Current / Upcoming / Past trip buckets
// from GET /trips, plus an Archived section populated client-side as the user
// archives trips in this session. Authorization and bucketing are server-side.
export function TripsDashboard() {
  const [data, setData] = useState<TripsResponse | null>(null)
  const [archived, setArchived] = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    fetchTrips(controller.signal)
      .then((trips) => {
        setData(trips)
        setLoading(false)
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

  if (loading) {
    return (
      <p className="trips-loading" aria-busy="true">
        Loading trips…
      </p>
    )
  }

  if (error) {
    return (
      <p role="alert" className="trips-error">
        {error}
      </p>
    )
  }

  if (!data) return null

  const currentTrip = data.current.find((t) => t.is_current) ?? null

  return (
    <div className="trips-dashboard">
      {pending?.type === 'archive' && (
        <ConfirmModal
          title="Archive trip"
          message={`Archive "${pending.trip.name}"? It will move to your archive and no longer appear in active lists.`}
          confirmLabel="Archive"
          onConfirm={handleConfirm}
          onCancel={() => setPending(null)}
        />
      )}
      {pending?.type === 'delete' && (
        <ConfirmModal
          title="Delete trip"
          message={`Permanently delete "${pending.trip.name}"? This removes all days and associated data and cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={handleConfirm}
          onCancel={() => setPending(null)}
          danger
        />
      )}
      <div className="trips-dashboard-header">
        <Link to="/trips/new" className="btn-primary trips-new-btn">
          + New trip
        </Link>
      </div>
      {actionError && (
        <p role="alert" className="trips-error">
          {actionError}
        </p>
      )}
      {currentTrip ? (
        <CurrentTripCard
          trip={currentTrip}
          onArchive={() => setPending({ type: 'archive', trip: currentTrip })}
          onDelete={() => setPending({ type: 'delete', trip: currentTrip })}
        />
      ) : (
        <BucketSection
          title="Current"
          trips={data.current}
          emptyLabel="No current trip."
          onArchive={(t) => setPending({ type: 'archive', trip: t })}
          onDelete={(t) => setPending({ type: 'delete', trip: t })}
        />
      )}
      <BucketSection
        title="Upcoming"
        trips={data.upcoming}
        emptyLabel="No upcoming trips."
        onArchive={(t) => setPending({ type: 'archive', trip: t })}
        onDelete={(t) => setPending({ type: 'delete', trip: t })}
      />
      <BucketSection
        title="Past"
        trips={data.past}
        emptyLabel="No past trips."
        onArchive={(t) => setPending({ type: 'archive', trip: t })}
        onDelete={(t) => setPending({ type: 'delete', trip: t })}
      />
      {archived.length > 0 && (
        <BucketSection
          title="Past/archived"
          trips={archived}
          emptyLabel=""
          onArchive={() => {}}
          onDelete={(t) => setPending({ type: 'delete', trip: t })}
        />
      )}
    </div>
  )
}
