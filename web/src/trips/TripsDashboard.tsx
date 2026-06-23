import { useEffect, useState } from 'react'
import { UnauthorizedError, fetchTrips, type Trip, type TripsResponse } from '../lib/api'
import { CurrentTripCard } from './CurrentTripCard'

// TripCard renders a single trip's summary: name, destinations, dates, and
// cover image if present. Authorization is server-side scoped — only trips the
// user owns or is a member of appear (PRD §5.9).
function TripCard({ trip }: { trip: Trip }) {
  const dateRange = `${trip.start_date} – ${trip.end_date}`
  const destinations = trip.destinations.join(', ')

  return (
    <article className="trip-card">
      {trip.cover && <img src={trip.cover} alt="" className="trip-card-cover" aria-hidden="true" />}
      <div className="trip-card-body">
        <h3 className="trip-card-name">{trip.name}</h3>
        {destinations && <p className="trip-card-destinations">{destinations}</p>}
        <p className="trip-card-dates">{dateRange}</p>
      </div>
    </article>
  )
}

// BucketSection renders a labelled bucket (Current / Upcoming / Past) with its
// trips or an empty-state message when there are none.
function BucketSection({
  title,
  trips,
  emptyLabel,
}: {
  title: string
  trips: Trip[]
  emptyLabel: string
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
              <TripCard trip={t} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// TripsDashboard fetches and renders the Current / Upcoming / Past trip buckets
// from GET /trips. Authorization and bucketing are entirely server-side — this
// component renders what the server returns without any client-side filtering.
export function TripsDashboard() {
  const [data, setData] = useState<TripsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
        if (err instanceof UnauthorizedError) return // central handler drives re-auth
        setError('Could not load trips. Please try again.')
        setLoading(false)
      })

    return () => controller.abort()
  }, [])

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
  const currentBucketRest = data.current.filter((t) => !t.is_current)

  return (
    <div className="trips-dashboard">
      {currentTrip && <CurrentTripCard trip={currentTrip} />}
      <BucketSection title="Current" trips={currentBucketRest} emptyLabel="No current trip." />
      <BucketSection title="Upcoming" trips={data.upcoming} emptyLabel="No upcoming trips." />
      <BucketSection title="Past" trips={data.past} emptyLabel="No past trips." />
    </div>
  )
}
