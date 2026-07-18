import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  fetchAdminActivity,
  fetchAdminStats,
  fetchAdminTrips,
  type AdminActivityEvent,
  type AdminMonthPoint,
  type AdminStats,
  type AdminTrip,
} from '../lib/api'
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

// monthLabel turns "2026-07" into "Jul".
function monthLabel(m: string): string {
  const d = new Date(`${m}-01T00:00:00`)
  return d.toLocaleString(undefined, { month: 'short' })
}

// AdminOverviewPage is the landing inside /admin (M08.5 redesign). Counts and
// 6-month growth come from the authoritative /admin/stats endpoint; the trips
// list powers the "happening now / upcoming" split (date-derived, since the
// backend only stores active/archived) and the recent-trips table.
export function AdminOverviewPage() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [trips, setTrips] = useState<AdminTrip[] | null>(null)
  const [activity, setActivity] = useState<AdminActivityEvent[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([fetchAdminStats(), fetchAdminTrips()])
      .then(([s, t]) => {
        if (!cancelled) {
          setStats(s)
          setTrips(t)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load overview')
      })
    // Activity is non-critical: a failure leaves the feed empty rather than
    // failing the whole dashboard.
    fetchAdminActivity()
      .then((a) => !cancelled && setActivity(a))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const derived = useMemo(() => {
    if (!trips) return null
    const today = todayISO()
    const active = trips.filter((t) => t.status === 'active')
    return {
      ongoing: active.filter((t) => t.start_date <= today && today <= t.end_date).length,
      upcoming: active.filter((t) => t.start_date > today).length,
      recent: [...trips].sort((a, b) => (a.start_date < b.start_date ? 1 : -1)).slice(0, 5),
    }
  }, [trips])

  const ready = stats && derived

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
      {!error && !ready && (
        <p className="admin-state" role="status">
          Loading…
        </p>
      )}

      {ready && (
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
              <div className="k-num">{stats.users.total}</div>
              <div className="k-lab">Registered users</div>
              <div className="k-sub">
                <span className="admin-dot" style={{ background: 'var(--ok)' }} />
                {stats.users.active} active · {stats.users.total - stats.users.active} deactivated
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
              <div className="k-num">{stats.trips.total}</div>
              <div className="k-lab">Total trips</div>
              <div className="k-sub">
                <span className="admin-dot" style={{ background: 'var(--info)' }} />
                {stats.trips.active} active · {stats.trips.archived} archived
              </div>
            </div>

            <div className="admin-kpi">
              <div className="k-top">
                <div className="k-ic">
                  <Icon d={['M12 12m-9 0a9 9 0 1018 0a9 9 0 10-18 0', 'M12 7v5l3 2']} />
                </div>
              </div>
              <div className="k-num">{derived.ongoing}</div>
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
              <div className="k-num">{derived.upcoming}</div>
              <div className="k-lab">Upcoming</div>
              <div className="k-sub">
                <span className="admin-dot" style={{ background: 'var(--accent)' }} />
                {stats.users.admins} admin{stats.users.admins === 1 ? '' : 's'} on the team
              </div>
            </div>
          </div>

          <GrowthCard points={stats.user_growth} />

          {activity.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <ActivityFeed events={activity} />
            </div>
          )}

          <div className="admin-tbl-wrap" style={{ marginTop: 16 }}>
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
                {derived.recent.length === 0 && (
                  <tr>
                    <td colSpan={4} className="admin-empty">
                      No trips yet.
                    </td>
                  </tr>
                )}
                {derived.recent.map((t) => (
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

// ACTIVITY_META maps an event kind to its icon path, tint and phrasing.
const ACTIVITY_META: Record<string, { icon: string[]; bg: string; fg: string; verb: string }> = {
  signup: {
    icon: ['M16 19a4 4 0 00-8 0', 'M12 8m-3.2 0a3.2 3.2 0 106.4 0a3.2 3.2 0 10-6.4 0'],
    bg: 'var(--accent-tint)',
    fg: 'var(--accent)',
    verb: 'signed up',
  },
  trip_created: {
    icon: ['M4 8h16v11a1 1 0 01-1 1H5a1 1 0 01-1-1V8z', 'M9 8V5a1 1 0 011-1h4a1 1 0 011 1v3'],
    bg: 'var(--amber-tint)',
    fg: 'var(--amber)',
    verb: 'created',
  },
  trip_shared: {
    icon: ['M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7', 'M16 6l-4-4-4 4', 'M12 2v13'],
    bg: 'var(--accent-tint)',
    fg: 'var(--accent)',
    verb: 'was added to',
  },
}

// relativeTime turns an ISO timestamp into a short "5h ago" / "2 days ago".
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const s = Math.max(0, Math.round((Date.now() - then) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  return d === 1 ? 'yesterday' : `${d} days ago`
}

// ActivityFeed renders the recent cross-user events: sign-ups, new trips, shares.
function ActivityFeed({ events }: { events: AdminActivityEvent[] }) {
  return (
    <div className="admin-card">
      <div className="admin-card-hd">
        <h3>Recent activity</h3>
      </div>
      <div className="admin-card-bd">
        <ul className="admin-feed">
          {events.map((e, i) => {
            const meta = ACTIVITY_META[e.kind] ?? ACTIVITY_META.signup
            return (
              <li key={`${e.at}-${i}`}>
                <span className="admin-feed-ic" style={{ background: meta.bg, color: meta.fg }}>
                  <Icon d={meta.icon} />
                </span>
                <div className="admin-feed-body">
                  <div className="admin-feed-txt">
                    <b>{e.actor || 'Someone'}</b> {meta.verb}
                    {e.target ? (
                      <>
                        {' '}
                        <b>{e.target}</b>
                      </>
                    ) : null}
                  </div>
                  <div className="admin-feed-meta">{relativeTime(e.at)}</div>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

// GrowthCard draws a filled area sparkline of cumulative users over the last 6
// months, with an emphasised endpoint and a since-start delta.
function GrowthCard({ points }: { points: AdminMonthPoint[] }) {
  if (points.length < 2) return null
  const w = 620
  const h = 120
  const max = Math.max(1, ...points.map((p) => p.count))
  const stepX = w / (points.length - 1)
  const coords = points.map((p, i) => ({
    x: i * stepX,
    y: h - 12 - (p.count / max) * (h - 24),
  }))
  const line = coords
    .map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
    .join(' ')
  const area = `${line} L${w},${h} L0,${h} Z`
  const last = points[points.length - 1].count
  const first = points[0].count
  const pct = first > 0 ? Math.round(((last - first) / first) * 100) : null
  const end = coords[coords.length - 1]

  return (
    <div className="admin-growth">
      <div className="admin-growth-hd">
        <h3>User growth · last 6 months</h3>
        <div className="admin-growth-now">
          <span className="admin-growth-num">{last}</span>
          <span>
            users
            {pct !== null && (
              <>
                {' · '}
                <span style={{ color: 'var(--accent)', fontWeight: 600 }}>
                  {pct >= 0 ? '+' : ''}
                  {pct}%
                </span>{' '}
                since {monthLabel(points[0].month)}
              </>
            )}
          </span>
        </div>
      </div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        width="100%"
        height={h}
        preserveAspectRatio="none"
        role="img"
        aria-label={`User growth from ${first} to ${last} over the last 6 months`}
      >
        <defs>
          <linearGradient id="admin-growth-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0.18" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1="0" y1="30" x2={w} y2="30" stroke="var(--line)" strokeWidth="1" />
        <line x1="0" y1="60" x2={w} y2="60" stroke="var(--line)" strokeWidth="1" />
        <line x1="0" y1="90" x2={w} y2="90" stroke="var(--line)" strokeWidth="1" />
        <path d={area} fill="url(#admin-growth-fill)" />
        <path
          d={line}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        <circle cx={end.x} cy={end.y} r="4.5" fill="var(--accent)" />
      </svg>
      <div className="admin-growth-axis">
        {points.map((p) => (
          <span key={p.month}>{monthLabel(p.month)}</span>
        ))}
      </div>
    </div>
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
