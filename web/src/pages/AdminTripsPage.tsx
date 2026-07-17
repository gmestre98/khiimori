import { useEffect, useMemo, useState } from 'react'
import { fetchAdminTrips, type AdminTrip } from '../lib/api'
import { AdminAvatar } from './adminShared'

type Filter = 'all' | 'now' | 'upcoming' | 'archived'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'now', label: 'Happening now' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'archived', label: 'Archived' },
]

const todayISO = () => new Date().toISOString().slice(0, 10)

// nightsBetween counts nights between two YYYY-MM-DD dates (end − start).
function nightsBetween(start: string, end: string): number {
  const ms = new Date(`${end}T00:00:00`).getTime() - new Date(`${start}T00:00:00`).getTime()
  if (Number.isNaN(ms)) return 0
  return Math.max(0, Math.round(ms / 86_400_000))
}

// tripState derives a human state from the trip's status + date range, since the
// backend only stores active/archived (no planning/completed concept).
function tripState(t: AdminTrip, today: string): { label: string; cls: string; dot: string } {
  if (t.status !== 'active')
    return { label: 'Archived', cls: 'admin-pill off', dot: 'var(--muted)' }
  if (t.start_date <= today && today <= t.end_date)
    return { label: 'Happening now', cls: 'admin-pill warn', dot: 'var(--warn)' }
  if (t.start_date > today) return { label: 'Upcoming', cls: 'admin-pill off', dot: 'var(--info)' }
  return { label: 'Past', cls: 'admin-pill ok', dot: 'var(--ok)' }
}

// AdminTripsPage lists every trip across all users (M08.5 S2) with search and a
// state filter derived from dates. Member/day counts and budget columns land in
// a follow-up once the list endpoint returns them.
export function AdminTripsPage() {
  const [trips, setTrips] = useState<AdminTrip[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')

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

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    const today = todayISO()
    return trips
      .filter((t) => {
        if (filter === 'archived' && t.status === 'active') return false
        if (
          filter === 'now' &&
          !(t.status === 'active' && t.start_date <= today && today <= t.end_date)
        )
          return false
        if (filter === 'upcoming' && !(t.status === 'active' && t.start_date > today)) return false
        if (q && !`${t.name} ${t.owner_email}`.toLowerCase().includes(q)) return false
        return true
      })
      .sort((a, b) => (a.start_date < b.start_date ? 1 : -1))
  }, [trips, query, filter])

  const today = todayISO()

  return (
    <>
      <div className="admin-top">
        <h1>Trips</h1>
        <p>
          {trips.length} across all travellers ·{' '}
          {
            trips.filter(
              (t) => t.status === 'active' && t.start_date <= today && today <= t.end_date,
            ).length
          }{' '}
          happening now
        </p>
      </div>

      <div className="admin-toolbar">
        <div className="admin-search">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4-4" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search trips or owners"
            aria-label="Search trips"
          />
        </div>
        <div className="admin-seg" role="tablist" aria-label="Filter trips">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={filter === f.key ? 'on' : ''}
              onClick={() => setFilter(f.key)}
              role="tab"
              aria-selected={filter === f.key}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <p className="admin-state" role="status">
          Loading trips…
        </p>
      )}
      {error && (
        <p className="admin-state" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && (
        <div className="admin-tbl-wrap">
          <table className="admin-tbl">
            <thead>
              <tr>
                <th>Trip</th>
                <th>Owner</th>
                <th>Dates</th>
                <th className="num">Nights</th>
                <th className="num">People</th>
                <th>State</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && (
                <tr>
                  <td colSpan={6} className="admin-empty">
                    No trips match.
                  </td>
                </tr>
              )}
              {shown.map((t) => {
                const st = tripState(t, today)
                return (
                  <tr key={t.id}>
                    <td>
                      <div className="admin-u">
                        <AdminAvatar name={t.name} email={t.name} size={30} />
                        <span className="admin-trip-nm">{t.name}</span>
                      </div>
                    </td>
                    <td className="admin-mini" style={{ color: 'var(--ink-2)' }}>
                      {t.owner_email}
                    </td>
                    <td className="num">
                      {t.start_date} → {t.end_date}
                    </td>
                    <td className="num">{nightsBetween(t.start_date, t.end_date)}</td>
                    <td className="num">{t.member_count ?? '—'}</td>
                    <td>
                      <span className={st.cls}>
                        <span className="admin-dot" style={{ background: st.dot }} />
                        {st.label}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
