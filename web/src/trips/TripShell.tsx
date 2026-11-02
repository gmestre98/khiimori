import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, Outlet, useLocation, useParams } from 'react-router-dom'
import { UnauthorizedError, fetchSharingData, fetchTrips, type Trip } from '../lib/api'
import { useCachedResource } from '../lib/useCachedResource'
import { cacheKeys } from '../lib/cacheKeys'
import { CacheStatus } from '../components/CacheStatus'
import { Icon } from '../components/ui/Icon'
import { ExportDialog } from './ExportDialog'
import { buildDayMetas, useTripDays, type DayMeta } from './tripDays'
import { tripDayCount } from '../lib/format'
import { countryColor } from '../design/countries'

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

// The trip's named child routes. Anything else under /trips/:id (the bare trip
// URL) redirects to today's day.
const NAMED_CHILDREN = ['backlog', 'plan', 'map', 'journal', 'budget', 'packing', 'sharing']

// TripShellRoute wraps TripShell with a key derived from the tripId param so
// React remounts TripShell whenever the user navigates to a different trip.
export function TripShellRoute() {
  const { tripId } = useParams<{ tripId: string }>()
  return <TripShell key={tripId} />
}

// headerMeta is the mono line under the trip name: dates · days · countries.
function headerMeta(trip: Trip): string {
  const start = new Date(trip.start_date + 'T00:00:00')
  const end = new Date(trip.end_date + 'T00:00:00')
  const fmt = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  const days = tripDayCount(trip.start_date, trip.end_date)
  const parts = [`${fmt(start)} – ${fmt(end)}`, `${days} ${days === 1 ? 'day' : 'days'}`]
  if (trip.destinations.length > 0) parts.push(trip.destinations.join(' · '))
  return parts.join(' · ')
}

// ShareButton opens the sharing page, showing who's on the trip as a small
// avatar stack (the owner plus a dashed "invite" slot when it's just you).
function ShareButton({ trip }: { trip: Trip }) {
  const { data } = useCachedResource(`GET /trips/${trip.id}/sharing`, (signal) =>
    fetchSharingData(trip.id, signal),
  )
  const members = data?.members ?? []
  const shown = members.slice(0, 3)
  return (
    <Link
      to={`/trips/${trip.id}/sharing`}
      state={{ trip }}
      className="trip-share-btn"
      aria-label={`Share ${trip.name}${members.length > 1 ? ` — ${members.length} people` : ''}`}
    >
      <span className="avatar-stack" aria-hidden="true">
        {shown.map((m) => (
          <span key={m.id} className="trip-share-avatar">
            {(m.name || m.email || m.user_id || '?')[0].toUpperCase()}
          </span>
        ))}
        {members.length <= 1 && <span className="trip-share-avatar trip-share-avatar--empty" />}
      </span>
      Share
    </Link>
  )
}

// TripMenu is the trip's ⋯ overflow menu: edit and export.
function TripMenu({ trip, onExport }: { trip: Trip; onExport: () => void }) {
  const ref = useRef<HTMLDetailsElement>(null)
  // Close on outside click / Escape.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onDoc = (e: Event) => {
      if (el.open && !el.contains(e.target as Node)) el.open = false
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && el.open) {
        el.open = false
        el.querySelector('summary')?.focus()
      }
    }
    document.addEventListener('pointerdown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [])
  return (
    <details className="fg-menu" ref={ref}>
      <summary
        className="fg-icon-btn fg-icon-btn--outline"
        aria-label={`More actions for ${trip.name}`}
      >
        <Icon name="more" size={18} />
      </summary>
      <div className="fg-menu-list">
        <Link
          to={`/trips/${trip.id}/edit`}
          state={{ trip }}
          className="fg-menu-item"
          aria-label={`Edit ${trip.name}`}
        >
          Edit trip
        </Link>
        <button
          type="button"
          className="fg-menu-item"
          onClick={() => {
            if (ref.current) ref.current.open = false
            onExport()
          }}
          aria-label={`Export ${trip.name} to Google Docs`}
        >
          Export…
        </button>
      </div>
    </details>
  )
}

// DayStrip is the desktop "days at a glance" row: one cell per day, a country
// colour bar on top, the day number, weekday and how many plans it holds.
// Empty days draw dashed. Hidden on phones (the Days list does this job).
function DayStrip({ trip, metas, current }: { trip: Trip; metas: DayMeta[]; current?: string }) {
  const activeRef = useRef<HTMLAnchorElement | null>(null)
  useEffect(() => {
    activeRef.current?.scrollIntoView?.({ inline: 'center', block: 'nearest' })
  }, [current])
  const countries = [...new Set(metas.map((m) => m.country).filter(Boolean))]
  return (
    <section className="day-glance" aria-label="Days at a glance">
      <div className="day-glance-scroll">
        <ol
          className="day-glance-row"
          style={{ gridTemplateColumns: `repeat(${metas.length}, minmax(40px, 1fr))` }}
        >
          {metas.map((m) => {
            const d = new Date(m.date + 'T00:00:00')
            const n = m.day ? m.day.plan_items.filter((i) => !i.unplanned).length : 0
            const isCurrent = m.date === current
            return (
              <li key={m.date}>
                <Link
                  ref={isCurrent ? activeRef : undefined}
                  to={`/trips/${trip.id}/days/${m.date}`}
                  state={{ trip }}
                  className={[
                    'day-glance-cell',
                    m.hasPlans ? '' : 'day-glance-cell--empty',
                    isCurrent ? 'day-glance-cell--current' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={{ '--country': m.color } as React.CSSProperties}
                  aria-current={isCurrent ? 'page' : undefined}
                  aria-label={`Day ${m.index + 1}, ${d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}${m.title ? `, ${m.title}` : ''} — ${n === 0 ? 'nothing planned' : `${n} ${n === 1 ? 'plan' : 'plans'}`}`}
                >
                  <span className="day-glance-num">{d.getDate()}</span>
                  <span className="day-glance-wd">
                    {d.toLocaleDateString('en-US', { weekday: 'short' })}
                  </span>
                  <span className="day-glance-count">{n > 0 ? n : '–'}</span>
                </Link>
              </li>
            )
          })}
        </ol>
      </div>
      <div className="day-glance-legend">
        {countries.map((c) => (
          <span key={c}>
            <i style={{ background: countryColor(c) }} aria-hidden="true" />
            {c}
          </span>
        ))}
        <span>
          <i className="day-glance-legend-empty" aria-hidden="true" />
          Nothing planned yet
        </span>
        <span>Numbers show how many plans each day has</span>
      </div>
    </section>
  )
}

// TripShell is the authenticated wrapper for a single trip. It resolves the trip
// (from router state if available, falling back to the trips listing), renders
// the trip header, and redirects the bare trip URL to today's day. Child routes
// render via <Outlet> and receive the trip through the outlet context.
function TripShell() {
  const { tripId, date: dateParam } = useParams<{ tripId: string; date?: string }>()
  const location = useLocation()
  const [exportOpen, setExportOpen] = useState(false)
  const stateTrip = (location.state as { trip?: Trip } | null)?.trip ?? null

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

  const lastSegment = location.pathname.replace(/\/+$/, '').split('/').pop() ?? ''
  const isAtRoot = !dateParam && !NAMED_CHILDREN.includes(lastSegment)
  if (isAtRoot) {
    const target = clampDate(todayStr(), trip.start_date, trip.end_date)
    return <Navigate to={`/trips/${trip.id}/days/${target}`} replace state={{ trip }} />
  }

  return (
    <TripShellBody
      trip={trip}
      dateParam={dateParam}
      fromCache={fromCache}
      isValidating={isValidating}
      onExport={() => setExportOpen(true)}
      exportOpen={exportOpen}
      onExportClose={() => setExportOpen(false)}
    />
  )
}

function TripShellBody({
  trip,
  dateParam,
  fromCache,
  isValidating,
  onExport,
  exportOpen,
  onExportClose,
}: {
  trip: Trip
  dateParam?: string
  fromCache: boolean
  isValidating: boolean
  onExport: () => void
  exportOpen: boolean
  onExportClose: () => void
}) {
  const location = useLocation()
  // The days are shared across the shell (desktop strip) and the Days list. The
  // open day's route is the refresh key so edits made there re-sync from cache.
  const tripDays = useTripDays(trip, location.pathname)
  const metas = tripDays.days ? buildDayMetas(tripDays.dates, tripDays.days) : null
  // The full trip header shows on the trip's overview screens; a single day and
  // the backlog have their own compact headers on phones.
  const onDay = !!dateParam
  const onBacklog = location.pathname.endsWith('/backlog')

  return (
    <div className="trip-shell" data-screen={onDay ? 'day' : onBacklog ? 'backlog' : 'section'}>
      <header className="trip-header">
        <div className="trip-header-top">
          <Link to="/" className="fg-back trip-header-back" aria-label="Back to trips">
            <Icon name="back" size={18} />
            Trips
          </Link>
          <div className="trip-header-actions">
            <ShareButton trip={trip} />
            <TripMenu trip={trip} onExport={onExport} />
          </div>
        </div>
        <div className="trip-header-titles">
          <p className="fg-meta trip-header-meta">{headerMeta(trip)}</p>
          <h1 className="trip-header-name">
            {trip.name}
            <CacheStatus fromCache={fromCache} isValidating={isValidating} />
          </h1>
        </div>
      </header>
      {exportOpen && (
        <ExportDialog tripId={trip.id} tripName={trip.name} open onClose={onExportClose} />
      )}
      {metas && (onDay || location.pathname.endsWith('/plan')) && (
        <DayStrip trip={trip} metas={metas} current={dateParam} />
      )}
      <Outlet context={{ trip, tripDays }} />
    </div>
  )
}
