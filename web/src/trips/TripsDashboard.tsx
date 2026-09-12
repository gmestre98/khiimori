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
import { CurrentTripCard } from './CurrentTripCard'
import { HeroScene } from './heroScene'
import { ConfirmModal } from '../components/ConfirmModal'
import { BudgetGlance } from './RollupDisplay'
import { formatDateRange, monthYear, tripDayCount } from '../lib/format'
import { CONTINENTS, continentLabel } from '../lib/continents'
import { readCache, writeCache } from '../lib/resourceCache'
import { cacheKeys } from '../lib/cacheKeys'
import { CacheStatus } from '../components/CacheStatus'

type Tab = 'current' | 'past'
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

// SearchIcon — inline SVG for the past-trips search field.
function SearchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
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
  const contLabel = continentLabel(trip.continent)
  const dateLine = isPast
    ? `${monthYear(trip.start_date)} · ${dayLabel}${contLabel ? ` · ${contLabel}` : ''}`
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
          {/* Past trips keep the calm grey panel; upcoming/lead trips get a
              destination scene (Direction B). */}
          {isPast ? (
            <div className="trip-card-panel-glow" />
          ) : (
            <>
              <HeroScene
                seed={trip.destinations[0] || trip.name}
                image={trip.cover_url || trip.cover}
                className="trip-card-panel-scene"
              />
              <div className="current-trip-panel-scrim" />
            </>
          )}
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
  // Current & Upcoming pool, in soonest-first order. The lead trip sits on its
  // own full-width row (the current trip's hero, or — with no current trip — the
  // next upcoming trip promoted to the top); the rest fill the 2-up grid below.
  const currentPool = data ? [...data.current, ...data.upcoming] : []
  const leadTrip = currentTrip ?? currentPool[0] ?? null
  const restTrips = leadTrip ? currentPool.filter((t) => t.id !== leadTrip.id) : currentPool
  const totalCount = data
    ? data.current.length + data.upcoming.length + data.past.length + archived.length
    : 0

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

      <div className="trips-page">
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

          {/* Invitations inbox — trips someone has shared with you, awaiting your
            accept. Shown regardless of email delivery so sharing always works. */}
          {invites.length > 0 && (
            <section className="trip-invites" aria-label="Trip invitations">
              <h2 className="trips-section-title">Invitations</h2>
              {inviteError && (
                <p role="alert" className="trips-error">
                  {inviteError}
                </p>
              )}
              <div className="trip-invites-list">
                {invites.map((inv) => (
                  <div
                    key={inv.id}
                    className="card pad trip-invite-row"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      marginBottom: 'var(--s3)',
                    }}
                  >
                    <div>
                      <strong>{inv.trip_name || 'A trip'}</strong>
                      <span className="meta"> · you're invited as {inv.role}</span>
                    </div>
                    <div className="row gap2">
                      <button
                        type="button"
                        className="btn-ghost"
                        disabled={acceptingId === inv.id || decliningId === inv.id}
                        onClick={() => handleDecline(inv)}
                        aria-label={`Decline invitation to ${inv.trip_name || 'trip'}`}
                      >
                        {decliningId === inv.id ? 'Declining…' : 'Decline'}
                      </button>
                      <button
                        type="button"
                        className="btn-primary"
                        disabled={acceptingId === inv.id || decliningId === inv.id}
                        onClick={() => handleAccept(inv)}
                        aria-label={`Accept invitation to ${inv.trip_name || 'trip'}`}
                      >
                        {acceptingId === inv.id ? 'Joining…' : 'Accept'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
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
                {tab === 'past'
                  ? pastFilterActive
                    ? `${pastSorted.length} of ${pastPool.length} trips`
                    : `${pastPool.length} ${pastPool.length === 1 ? 'trip' : 'trips'}`
                  : `${totalCount} ${totalCount === 1 ? 'trip' : 'trips'}`}
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
                  {pastPool.length === 0 ? (
                    <p className="trips-empty">No past trips yet.</p>
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
                              {CONTINENTS.filter((c) => pastContinentsPresent.has(c.slug)).map(
                                (c) => (
                                  <option key={c.slug} value={c.slug}>
                                    {c.label}
                                  </option>
                                ),
                              )}
                            </select>
                          </label>
                        )}

                        <label className="past-search">
                          <SearchIcon />
                          <input
                            type="search"
                            value={pastSearch}
                            onChange={(e) => setPastSearch(e.target.value)}
                            placeholder="Search past trips"
                            aria-label="Search past trips"
                          />
                        </label>
                      </div>

                      {pastSorted.length === 0 ? (
                        <p className="trips-empty">
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
                          <section
                            key={g.year}
                            className="past-year"
                            aria-label={`Trips from ${g.year}`}
                          >
                            <div className="past-year-head">
                              <span className="past-year-num">{g.year}</span>
                              <span className="past-year-count">
                                {g.trips.length} {g.trips.length === 1 ? 'trip' : 'trips'}
                              </span>
                              <span className="past-year-rule" aria-hidden="true" />
                            </div>
                            <div className="trips-grid">
                              {g.trips.map((t) => (
                                <TripCard
                                  key={t.id}
                                  trip={t}
                                  isPast
                                  onDelete={(trip) => setPending({ type: 'delete', trip })}
                                />
                              ))}
                            </div>
                          </section>
                        ))
                      ) : (
                        <div className="trips-grid">
                          {pastSorted.map((t) => (
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
            </>
          )}
        </div>
      </div>
    </>
  )
}
