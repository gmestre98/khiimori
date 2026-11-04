import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  UnauthorizedError,
  fetchBudgetRollup,
  fetchTrips,
  fetchMyInvitations,
  acceptInvitation,
  declineInvitation,
  archiveTrip,
  deleteTrip,
  type BudgetRollup,
  type PendingInvitation,
  type Trip,
  type TripsResponse,
} from '../lib/api'
import { HeroScene } from './heroScene'
import { ConfirmModal } from '../components/ConfirmModal'
import { monthYear, tripDayCount, euroWhole } from '../lib/format'
import { useAuth } from '../auth/AuthContext'
import { Icon } from '../components/ui/Icon'
import { buildDayMetas, routeSegments, useTripDays } from './tripDays'
import { CONTINENTS, continentLabel } from '../lib/continents'
import { readCache, writeCache } from '../lib/resourceCache'
import { cacheKeys } from '../lib/cacheKeys'
import { CacheStatus } from '../components/CacheStatus'

type Tab = 'upcoming' | 'past'
type PendingAction = { type: 'archive' | 'delete'; trip: Trip }

// PastSort is how the Past tab orders trips. Newest-first is the default (past
// trips read most-recent-first); 'longest' and 'az' are non-chronological, so the
// year grouping falls back to a flat grid for them (see the Past tab below).
type PastSort = 'newest' | 'oldest' | 'longest' | 'az'

const PAST_SORTS: { value: PastSort; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'longest', label: 'Longest trip' },
  { value: 'az', label: 'A–Z by name' },
]

// tripYear is the calendar year a trip started in (used to group past trips).
// Taken from the YYYY-MM-DD prefix so it is timezone-independent.
function tripYear(iso: string): number {
  return Number(iso.slice(0, 4))
}

// comparePast orders two trips for the given sort.
function comparePast(a: Trip, b: Trip, sort: PastSort): number {
  switch (sort) {
    case 'oldest':
      return a.start_date.localeCompare(b.start_date)
    case 'longest':
      return tripDayCount(b.start_date, b.end_date) - tripDayCount(a.start_date, a.end_date)
    case 'az':
      return a.name.localeCompare(b.name)
    case 'newest':
    default:
      return b.start_date.localeCompare(a.start_date)
  }
}

// YearGroup is one year's worth of past trips, for the grouped (chronological)
// view.
type YearGroup = { year: number; trips: Trip[] }

// groupByYear buckets already-sorted trips into year groups, preserving the
// incoming order both across and within years (the caller sorts newest- or
// oldest-first, and the first trip seen for a year fixes that year's position).
function groupByYear(trips: Trip[]): YearGroup[] {
  const groups: YearGroup[] = []
  const byYear = new Map<number, YearGroup>()
  for (const t of trips) {
    const year = tripYear(t.start_date)
    let g = byYear.get(year)
    if (!g) {
      g = { year, trips: [] }
      byYear.set(year, g)
      groups.push(g)
    }
    g.trips.push(t)
  }
  return groups
}

// daysUntil returns whole days from today to an ISO date (negative if past).
function daysUntil(iso: string): number {
  const target = new Date(iso + 'T00:00:00').getTime()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((target - today.getTime()) / 86_400_000)
}

// shortRange: "18 Nov – 9 Dec" (year dropped — the list is already grouped).
function shortRange(start: string, end: string): string {
  const f = (iso: string) =>
    new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  return `${f(start)} – ${f(end)}`
}

// TripMenu is a trip's ⋯ menu: Edit / Archive / Delete. Destructive actions
// live here rather than as always-visible buttons on every card.
function TripMenu({
  trip,
  onArchive,
  onDelete,
}: {
  trip: Trip
  onArchive?: (trip: Trip) => void
  onDelete: (trip: Trip) => void
}) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, close])
  return (
    <div
      className="fg-menu trip-menu"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) close()
      }}
    >
      <button
        type="button"
        className="fg-icon-btn trip-menu-btn"
        aria-label={`Trip options for ${trip.name}: edit, archive, delete`}
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="more" size={20} />
      </button>
      {open && (
        <div className="fg-menu-list" role="group" aria-label={`${trip.name} options`}>
          <Link
            to={`/trips/${trip.id}/edit`}
            state={{ trip }}
            className="fg-menu-item"
            aria-label={`Edit ${trip.name}`}
          >
            Edit
          </Link>
          {onArchive && (
            <button
              type="button"
              className="fg-menu-item"
              onClick={() => {
                close()
                onArchive(trip)
              }}
              aria-label={`Archive ${trip.name}`}
            >
              Archive
            </button>
          )}
          <button
            type="button"
            className="fg-menu-item fg-menu-item--danger"
            onClick={() => {
              close()
              onDelete(trip)
            }}
            aria-label={`Delete ${trip.name}`}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  )
}

// FeaturedTrip is the "next up" card: cover, name, countries · dates, the
// country route strip, and readiness stats (days planned, money booked). Open
// to-dos are omitted until to-dos have a backend.
function FeaturedTrip({
  trip,
  rollup,
  onArchive,
  onDelete,
}: {
  trip: Trip
  rollup: BudgetRollup | null
  onArchive: (trip: Trip) => void
  onDelete: (trip: Trip) => void
}) {
  const { dates, days } = useTripDays(trip)
  const metas = days ? buildDayMetas(dates, days) : null
  const planned = metas ? metas.filter((m) => m.hasPlans).length : null
  const segments = metas ? routeSegments(metas) : []
  const total = tripDayCount(trip.start_date, trip.end_date)
  const until = daysUntil(trip.start_date)
  const booked = rollup ? rollup.trip_total + (rollup.estimated_trip_total ?? 0) : null
  const cover = trip.cover_url || trip.cover
  const eyebrow =
    trip.is_current || until <= 0 ? 'Now' : `Next up · in ${until} ${until === 1 ? 'day' : 'days'}`

  return (
    <section className="trips-featured" aria-label={trip.is_current ? 'Current trip' : 'Next trip'}>
      <span className="fg-label">{eyebrow}</span>
      <article className="featured-card">
        <div className="featured-cover" aria-hidden="true">
          <HeroScene
            seed={trip.destinations[0] || trip.name}
            image={cover}
            className="featured-cover-scene"
          />
          <span className="featured-days">
            {total} {total === 1 ? 'day' : 'days'}
          </span>
        </div>
        <Link
          to={`/trips/${trip.id}`}
          state={{ trip }}
          className="featured-body"
          aria-label={`Open ${trip.name}`}
        >
          <h2 className="featured-name">{trip.name}</h2>
          <p className="featured-meta">
            {[trip.destinations.join(' · '), shortRange(trip.start_date, trip.end_date)]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {segments.length > 0 && (
            <span className="route-strip" aria-hidden="true">
              {segments.map((seg, i) => (
                <span
                  key={i}
                  style={{ flex: seg.days, '--country': seg.color } as React.CSSProperties}
                />
              ))}
            </span>
          )}
          <span
            className="fg-stats featured-stats"
            style={{ '--cols': booked != null ? 2 : 1 } as React.CSSProperties}
          >
            <span className="fg-stat">
              <span className="fg-stat-value">
                {planned ?? '–'}
                <small>/{total}</small>
              </span>
              <span className="fg-stat-label">days planned</span>
            </span>
            {booked != null && (
              <span className="fg-stat">
                <span className="fg-stat-value">{euroWhole(booked)}</span>
                <span className="fg-stat-label">booked</span>
              </span>
            )}
          </span>
        </Link>
        <div className="featured-menu">
          <TripMenu trip={trip} onArchive={onArchive} onDelete={onDelete} />
        </div>
      </article>
    </section>
  )
}

// TripRow is a compact trip row: thumbnail, name, countries, mono dates and a
// status chip; options live in its ⋯ menu.
function TripRow({
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
  const days = tripDayCount(trip.start_date, trip.end_date)
  const until = daysUntil(trip.start_date)
  const contLabel = continentLabel(trip.continent)
  const status = isPast
    ? null
    : trip.is_current || until <= 0
      ? 'Now'
      : until <= 30
        ? 'Soon'
        : 'Planning'
  const dateLine = isPast
    ? `${monthYear(trip.start_date)} · ${days} ${days === 1 ? 'day' : 'days'}${contLabel ? ` · ${contLabel}` : ''}`
    : `${shortRange(trip.start_date, trip.end_date)} · ${days} ${days === 1 ? 'day' : 'days'}`
  return (
    <li className={isPast ? 'trip-row trip-row--past' : 'trip-row'}>
      <Link
        to={`/trips/${trip.id}`}
        state={{ trip }}
        className="trip-row-link"
        aria-label={`Open ${trip.name}`}
      >
        <span className="trip-row-thumb" aria-hidden="true">
          <HeroScene
            seed={trip.destinations[0] || trip.name}
            image={trip.cover_url || trip.cover}
            className="trip-row-scene"
          />
        </span>
        <span className="trip-row-body">
          <h3 className="trip-row-name">{trip.name}</h3>
          {trip.destinations.length > 0 && (
            <span className="trip-row-dest">{trip.destinations.join(' · ')}</span>
          )}
          <span className="trip-row-dates">{dateLine}</span>
          {status && (
            <span className={status === 'Now' ? 'tag tag--ok' : 'tag tag--accent'}>{status}</span>
          )}
        </span>
      </Link>
      <TripMenu trip={trip} onArchive={onArchive} onDelete={onDelete} />
    </li>
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
  const [tab, setTab] = useState<Tab>('upcoming')
  // Past-tab controls: how the list is ordered, an optional continent filter
  // ('' = all), and a free-text search over name + destinations.
  const [pastSort, setPastSort] = useState<PastSort>('newest')
  const [pastContinent, setPastContinent] = useState<string>('')
  const [pastSearch, setPastSearch] = useState('')
  // Instant-render cache state (M11.1 S2): true while showing the cached trips
  // list and while a background refresh runs — drives the subtle "Updating…"
  // hint so the dashboard never blocks on the backend cold start.
  const [fromCache, setFromCache] = useState(false)
  const [validating, setValidating] = useState(false)
  // Pending invitations waiting for this user (in-app inbox). The invite email
  // is best-effort, so this is how a shared-with user actually finds the trip.
  const [invites, setInvites] = useState<PendingInvitation[]>([])
  const [acceptingId, setAcceptingId] = useState<string | null>(null)
  const [decliningId, setDecliningId] = useState<string | null>(null)
  const [inviteError, setInviteError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    let done = false
    const key = cacheKeys.trips()

    // Fetch the current trip's budget roll-up (best-effort, non-blocking).
    const loadRollup = (trips: TripsResponse) => {
      const lead = trips.current.find((t) => t.is_current) ?? trips.current[0] ?? trips.upcoming[0]
      if (!lead) return
      fetchBudgetRollup(lead.id, controller.signal)
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

  // Load the invitations addressed to this user. Best-effort: a failure just
  // hides the inbox (the trips list is the primary content).
  useEffect(() => {
    const controller = new AbortController()
    fetchMyInvitations(controller.signal)
      .then(setInvites)
      .catch(() => {})
    return () => controller.abort()
  }, [])

  // handleAccept joins the trip behind an invitation, then refreshes the trips
  // list so the newly-joined trip appears without a manual reload.
  async function handleAccept(inv: PendingInvitation) {
    setAcceptingId(inv.id)
    setInviteError(null)
    try {
      await acceptInvitation(inv.id)
      setInvites((prev) => prev.filter((i) => i.id !== inv.id))
      const trips = await fetchTrips()
      setData(trips)
      void writeCache(cacheKeys.trips(), trips)
    } catch (err: unknown) {
      if (err instanceof UnauthorizedError) return
      setInviteError(
        err instanceof Error ? err.message : `Could not accept the invitation. Please try again.`,
      )
    } finally {
      setAcceptingId(null)
    }
  }

  // handleDecline turns down an invitation, removing it from this user's inbox.
  // Declining also drops the invite off the owner's pending-invites list.
  async function handleDecline(inv: PendingInvitation) {
    setDecliningId(inv.id)
    setInviteError(null)
    try {
      await declineInvitation(inv.id)
      setInvites((prev) => prev.filter((i) => i.id !== inv.id))
    } catch (err: unknown) {
      if (err instanceof UnauthorizedError) return
      setInviteError(
        err instanceof Error ? err.message : `Could not decline the invitation. Please try again.`,
      )
    } finally {
      setDecliningId(null)
    }
  }

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
  // Upcoming pool (current first, then soonest-first). The lead trip is
  // featured; the rest are compact rows.
  const currentPool = data ? [...data.current, ...data.upcoming] : []
  const leadTrip = currentTrip ?? currentPool[0] ?? null
  const restTrips = leadTrip ? currentPool.filter((t) => t.id !== leadTrip.id) : currentPool
  const upcomingCount = currentPool.length

  // Past tab: the full past pool (server's past bucket plus trips archived this
  // session), then the continent + search filters, then the chosen sort. Only
  // continents actually present in the pool are offered in the filter.
  const pastPool = data ? [...data.past, ...archived] : []
  const pastContinentsPresent = new Set(pastPool.map((t) => t.continent || '').filter(Boolean))
  const pastQuery = pastSearch.trim().toLowerCase()
  const pastFiltered = pastPool.filter((t) => {
    if (pastContinent && (t.continent || '') !== pastContinent) return false
    if (pastQuery) {
      const haystack = `${t.name} ${t.destinations.join(' ')}`.toLowerCase()
      if (!haystack.includes(pastQuery)) return false
    }
    return true
  })
  const pastSorted = [...pastFiltered].sort((a, b) => comparePast(a, b, pastSort))
  const pastFilterActive = pastContinent !== '' || pastQuery !== ''
  // Year grouping is the structure for the chronological sorts; 'longest' and
  // 'az' order across years, so they render as one flat grid instead.
  const pastGrouped = pastSort === 'newest' || pastSort === 'oldest'
  const pastYearGroups = pastGrouped ? groupByYear(pastSorted) : []

  const { user } = useAuth()
  const initial = (user?.name || user?.email || 'You')[0].toUpperCase()
  const archive = (trip: Trip) => setPending({ type: 'archive', trip })
  const remove = (trip: Trip) => setPending({ type: 'delete', trip })

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

      <div className="trips-page fg-screen" data-tab={tab}>
        <div className="trips-top">
          <span className="trips-brand">Khiimori</span>
          <Link to="/profile" className="trips-avatar" aria-label="Profile and settings">
            {user?.avatar ? <img src={user.avatar} alt="" /> : initial}
          </Link>
        </div>

        <div className="trips-head">
          <h1 className="trips-title">
            Trips
            <CacheStatus fromCache={fromCache} isValidating={validating} />
          </h1>
          <div className="seg" role="group" aria-label="Which trips">
            <button
              type="button"
              className="seg-btn"
              aria-pressed={tab === 'upcoming'}
              onClick={() => setTab('upcoming')}
            >
              Upcoming{data ? ` ${upcomingCount}` : ''}
            </button>
            <button
              type="button"
              className="seg-btn"
              aria-pressed={tab === 'past'}
              onClick={() => setTab('past')}
            >
              Past{data ? ` ${pastPool.length}` : ''}
            </button>
          </div>
        </div>

        {actionError && (
          <p role="alert" className="fg-error">
            {actionError}
          </p>
        )}

        {/* Invitations inbox — trips someone has shared with you, awaiting your
            accept. Shown regardless of email delivery so sharing always works. */}
        {invites.length > 0 && (
          <section className="trip-invites" aria-label="Trip invitations">
            <h2 className="fg-label">Invitations</h2>
            {inviteError && (
              <p role="alert" className="fg-error">
                {inviteError}
              </p>
            )}
            <ul className="trip-invites-list">
              {invites.map((inv) => (
                <li key={inv.id} className="trip-invite-row fg-card">
                  <div>
                    <strong>{inv.trip_name || 'A trip'}</strong>
                    <span className="fg-muted"> · you’re invited as {inv.role}</span>
                  </div>
                  <div className="trip-invite-actions">
                    <button
                      type="button"
                      className="fg-btn fg-btn--quiet"
                      disabled={acceptingId === inv.id || decliningId === inv.id}
                      onClick={() => handleDecline(inv)}
                      aria-label={`Decline invitation to ${inv.trip_name || 'trip'}`}
                    >
                      {decliningId === inv.id ? 'Declining…' : 'Decline'}
                    </button>
                    <button
                      type="button"
                      className="fg-btn fg-btn--primary"
                      disabled={acceptingId === inv.id || decliningId === inv.id}
                      onClick={() => handleAccept(inv)}
                      aria-label={`Accept invitation to ${inv.trip_name || 'trip'}`}
                    >
                      {acceptingId === inv.id ? 'Joining…' : 'Accept'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {loading && (
          <p className="fg-loading" aria-busy="true">
            Loading trips…
          </p>
        )}
        {error && (
          <p role="alert" className="fg-error">
            {error}
          </p>
        )}

        {!loading && !error && data && tab === 'upcoming' && (
          <div className="trips-board">
            {leadTrip ? (
              <FeaturedTrip
                trip={leadTrip}
                rollup={currentRollup}
                onArchive={archive}
                onDelete={remove}
              />
            ) : (
              <p className="fg-empty">No upcoming trips yet.</p>
            )}

            {restTrips.length > 0 && (
              <section className="trips-later" aria-label="Upcoming trips">
                <h2 className="fg-label fg-section-label">Later</h2>
                <ul className="trip-rows">
                  {restTrips.map((t) => (
                    <TripRow key={t.id} trip={t} onArchive={archive} onDelete={remove} />
                  ))}
                </ul>
              </section>
            )}

            <Link to="/trips/new" className="trips-new">
              <Icon name="plus" size={22} />
              <span>
                <span className="trips-new-title">New trip</span>
                <span className="trips-new-sub">
                  Places and dates first. Days, route and budget follow.
                </span>
              </span>
            </Link>
          </div>
        )}

        {!loading && !error && data && tab === 'past' && (
          <>
            {pastPool.length === 0 ? (
              <p className="fg-empty">No past trips yet.</p>
            ) : (
              <>
                {/* Sort · continent · search. Continent only appears once at
                    least one past trip is tagged. */}
                <div className="past-controls">
                  <label className="past-control">
                    <span className="past-control-label">Sort</span>
                    <select
                      className="past-select"
                      value={pastSort}
                      onChange={(e) => setPastSort(e.target.value as PastSort)}
                    >
                      {PAST_SORTS.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  {pastContinentsPresent.size > 0 && (
                    <label className="past-control">
                      <span className="past-control-label">Continent</span>
                      <select
                        className="past-select"
                        value={pastContinent}
                        onChange={(e) => setPastContinent(e.target.value)}
                      >
                        <option value="">All continents</option>
                        {CONTINENTS.filter((c) => pastContinentsPresent.has(c.slug)).map((c) => (
                          <option key={c.slug} value={c.slug}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  <label className="past-search">
                    <Icon name="search" size={16} />
                    <input
                      type="search"
                      value={pastSearch}
                      onChange={(e) => setPastSearch(e.target.value)}
                      placeholder="Search past trips"
                      aria-label="Search past trips"
                    />
                  </label>
                </div>

                <p className="fg-muted trips-past-count">
                  {pastFilterActive
                    ? `${pastSorted.length} of ${pastPool.length} trips`
                    : `${pastPool.length} ${pastPool.length === 1 ? 'trip' : 'trips'}`}
                </p>

                {pastSorted.length === 0 ? (
                  <p className="fg-empty">
                    No past trips match your filters.{' '}
                    <button
                      type="button"
                      className="past-clear"
                      onClick={() => {
                        setPastContinent('')
                        setPastSearch('')
                      }}
                    >
                      Clear filters
                    </button>
                  </p>
                ) : pastGrouped ? (
                  pastYearGroups.map((g) => (
                    <section key={g.year} className="past-year" aria-label={`Trips from ${g.year}`}>
                      <div className="past-year-head">
                        <span className="past-year-num">{g.year}</span>
                        <span className="past-year-count">
                          {g.trips.length} {g.trips.length === 1 ? 'trip' : 'trips'}
                        </span>
                      </div>
                      <ul className="trip-rows">
                        {g.trips.map((t) => (
                          <TripRow key={t.id} trip={t} isPast onDelete={remove} />
                        ))}
                      </ul>
                    </section>
                  ))
                ) : (
                  <ul className="trip-rows">
                    {pastSorted.map((t) => (
                      <TripRow key={t.id} trip={t} isPast onDelete={remove} />
                    ))}
                  </ul>
                )}
              </>
            )}
          </>
        )}
      </div>
    </>
  )
}
