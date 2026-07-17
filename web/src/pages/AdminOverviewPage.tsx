import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchAdminTrips, fetchAdminUsers, type AdminTrip, type AdminUser } from '../lib/api'
import { AdminAvatar } from './adminShared'

// Small stroke-icon helper (Lucide style), matching the rest of the admin UI.
function Icon({ d }: { d: string | string[] }) {
  const paths = Array.isArray(d) ? d : [d]
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths.map((p, i) => (
        <path key={i} d={p} />
      ))}
    </svg>
  )
}

const todayISO = () => new Date().toISOString().slice(0, 10)

// AdminOverviewPage is the landing inside /admin (M08.5 redesign). It composes a
// live snapshot from the existing user + trip lists — no dedicated stats
// endpoint yet (that lands in a follow-up, adding growth over time). Trip state
// is derived honestly from status (active/archived) and the date range, since
// the backend has no "planning/completed" concept.
export function AdminOverviewPage() {
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [trips, setTrips] = useState<AdminTrip[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([fetchAdminUsers(), fetchAdminTrips()])
      .then(([u, t]) => {
        if (!cancelled) {
          setUsers(u)
          setTrips(t)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load overview')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const stats = useMemo(() => {
    if (!users || !trips) return null
    const today = todayISO()
    const activeUsers = users.filter((u) => u.active).length
    const admins = users.filter((u) => u.is_admin).length
    const activeTrips = trips.filter((t) => t.status === 'active')
    const ongoing = activeTrips.filter((t) => t.start_date <= today && today <= t.end_date)
    const upcoming = activeTrips.filter((t) => t.start_date > today)
    const recent = [...trips].sort((a, b) => (a.start_date < b.start_date ? 1 : -1)).slice(0, 5)
    return {
      users: users.length,
      activeUsers,
      deactivated: users.length - activeUsers,
      admins,
      trips: trips.length,
      activeTrips: activeTrips.length,
      archived: trips.length - activeTrips.length,
      ongoing: ongoing.length,
      upcoming: upcoming.length,
      recent,
    }
  }, [users, trips])

  return (
    <>
      <div className="admin-top">
        <h1>Overview</h1>
        <p>How Khiimori is doing right now</p>
      </div>

      {error && (
        <p className="admin-state" role="alert">
          {error}
        </p>
      )}
      {!error && !stats && (
        <p className="admin-state" role="status">
          Loading…
        </p>
      )}

      {stats && (
        <>
          <div className="admin-kpis">
            <div className="admin-kpi">
              <div className="k-top">
                <div className="k-ic">
                  <Icon
                    d={['M16 19a4 4 0 00-8 0', 'M12 8m-3.2 0a3.2 3.2 0 106.4 0a3.2 3.2 0 10-6.4 0']}
                  />
                </div>
              </div>
              <div className="k-num">{stats.users}</div>
              <div className="k-lab">Registered users</div>
              <div className="k-sub">
                <span className="admin-dot" style={{ background: 'var(--ok)' }} />
                {stats.activeUsers} active · {stats.deactivated} deactivated
              </div>
            </div>

            <div className="admin-kpi">
              <div className="k-top">
                <div className="k-ic">
                  <Icon
                    d={[
                      'M4 8h16v11a1 1 0 01-1 1H5a1 1 0 01-1-1V8z',
                      'M9 8V5a1 1 0 011-1h4a1 1 0 011 1v3',
                    ]}
                  />
                </div>
              </div>
              <div className="k-num">{stats.trips}</div>
              <div className="k-lab">Total trips</div>
              <div className="k-sub">
                <span className="admin-dot" style={{ background: 'var(--info)' }} />
                {stats.activeTrips} active · {stats.archived} archived
              </div>
            </div>

            <div className="admin-kpi">
              <div className="k-top">
                <div className="k-ic">
                  <Icon d={['M12 12m-9 0a9 9 0 1018 0a9 9 0 10-18 0', 'M12 7v5l3 2']} />
                </div>
              </div>
              <div className="k-num">{stats.ongoing}</div>
              <div className="k-lab">Happening now</div>
              <div className="k-sub">
                <span className="admin-dot" style={{ background: 'var(--warn)' }} />
                trips underway today
              </div>
            </div>

            <div className="admin-kpi">
              <div className="k-top">
                <div className="k-ic">
                  <Icon
                    d={[
                      'M8 2v4M16 2v4M3 9h18',
                      'M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z',
                    ]}
                  />
                </div>
              </div>
              <div className="k-num">{stats.upcoming}</div>
              <div className="k-lab">Upcoming</div>
              <div className="k-sub">
                <span className="admin-dot" style={{ background: 'var(--accent)' }} />
                {stats.admins} admin{stats.admins === 1 ? '' : 's'} on the team
              </div>
            </div>
          </div>

          <div className="admin-tbl-wrap">
            <table className="admin-tbl">
              <thead>
                <tr>
                  <th>Recent trips</th>
                  <th>Owner</th>
                  <th>Dates</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>
                {stats.recent.length === 0 && (
                  <tr>
                    <td colSpan={4} className="admin-empty">
                      No trips yet.
                    </td>
                  </tr>
                )}
                {stats.recent.map((t) => (
                  <RecentTripRow key={t.id} trip={t} today={todayISO()} />
                ))}
              </tbody>
            </table>
          </div>
          <p className="admin-mini" style={{ marginTop: 12 }}>
            <Link to="/admin/trips" style={{ color: 'var(--accent)', fontWeight: 600 }}>
              View all trips →
            </Link>
          </p>
        </>
      )}
    </>
  )
}

function RecentTripRow({ trip, today }: { trip: AdminTrip; today: string }) {
  let label = 'Archived'
  let cls = 'admin-pill off'
  let dot = 'var(--muted)'
  if (trip.status === 'active') {
    if (trip.start_date <= today && today <= trip.end_date) {
      label = 'Happening now'
      cls = 'admin-pill warn'
      dot = 'var(--warn)'
    } else if (trip.start_date > today) {
      label = 'Upcoming'
      cls = 'admin-pill off'
      dot = 'var(--info)'
    } else {
      label = 'Past'
      cls = 'admin-pill ok'
      dot = 'var(--ok)'
    }
  }
  return (
    <tr>
      <td>
        <div className="admin-u">
          <AdminAvatar name={trip.name} email={trip.name} size={30} />
          <span className="admin-trip-nm">{trip.name}</span>
        </div>
      </td>
      <td className="admin-mini" style={{ color: 'var(--ink-2)' }}>
        {trip.owner_email}
      </td>
      <td className="num">
        {trip.start_date} → {trip.end_date}
      </td>
      <td>
        <span className={cls}>
          <span className="admin-dot" style={{ background: dot }} />
          {label}
        </span>
      </td>
    </tr>
  )
}
