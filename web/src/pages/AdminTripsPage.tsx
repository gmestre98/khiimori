import { useEffect, useState } from 'react'
import { fetchAdminTrips, type AdminTrip } from '../lib/api'

// AdminTripsPage lists all trips across all users for the admin backoffice
// (M08.5 S2). Grant/revoke/role-change actions are wired in S3.
export function AdminTripsPage() {
  const [trips, setTrips] = useState<AdminTrip[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchAdminTrips()
      .then((data) => {
        if (!cancelled) {
          setTrips(data)
          setLoading(false)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load trips')
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) return <p role="status">Loading trips…</p>
  if (error) return <p role="alert">Error: {error}</p>

  return (
    <div>
      <h3>Trips ({trips.length})</h3>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Owner</th>
            <th>Start</th>
            <th>End</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {trips.map((t) => (
            <tr key={t.id}>
              <td>{t.name}</td>
              <td>{t.owner_email}</td>
              <td>{t.start_date}</td>
              <td>{t.end_date}</td>
              <td>{t.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
