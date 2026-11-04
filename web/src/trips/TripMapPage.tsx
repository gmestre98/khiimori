import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { datesInRange, fetchDay, UnauthorizedError, type Day, type LatLng } from '../lib/api'
import { loadDayRoute } from '../lib/dayRouteCache'
import { euroWhole, localToday } from '../lib/format'
import { countryColor, NO_COUNTRY_COLOR } from '../design/countries'
import { Icon } from '../components/ui/Icon'
import {
  collectLocatedItems,
  collectLocations,
  type ItemOrder,
  type LocatedItem,
} from './locatedItems'
import { buildDayMetas, stayRuns, type DayMeta } from './tripDays'
import { useTripShell } from './useTripShell'
import type { TripDayMarkers } from './TripMap'
import { isPaid, packageForStay, usePackages } from './packages'

const TripMap = lazy(() => import('./TripMap'))

// DayEntry is the per-day state the page tracks: the located items, the
// geocoded waypoints (positional, aligned with items — null where a stop didn't
// resolve), and a status.
interface DayEntry {
  date: string
  index: number
  day: Day
  items: LocatedItem[]
  waypoints: (LatLng | null)[]
  status: 'no-places' | 'ok' | 'unplaceable' | 'error'
}

// loadDay fetches one day and, when it has any location, geocodes its stops.
// Failures fold into the entry's status so one bad day doesn't blank the map.
async function loadDay(
  tripId: string,
  date: string,
  index: number,
  order: ItemOrder,
  signal: AbortSignal,
): Promise<DayEntry> {
  const day = await fetchDay(tripId, date, signal)
  const items = collectLocatedItems(day, order)
  const locations = collectLocations(day, order)
  const base: DayEntry = { date, index, day, items, waypoints: [], status: 'no-places' }
  if (locations.length === 0) return base
  try {
    const waypoints = await loadDayRoute(tripId, date, locations, signal)
    return { ...base, waypoints, status: waypoints.some(Boolean) ? 'ok' : 'unplaceable' }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    if (err instanceof UnauthorizedError) throw err
    return { ...base, status: 'error' }
  }
}

// DayGroup is a run of consecutive days in the same country/place — the map's
// chips ("18–19 Nov · Dakar"). Toggling a group selects all its days.
interface DayGroup {
  key: string
  label: string
  color: string
  dates: string[]
}

function fmtDay(iso: string, withMonth = true): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString(
    'en-GB',
    withMonth ? { day: 'numeric', month: 'short' } : { day: 'numeric' },
  )
}

function rangeLabel(a: string, b: string): string {
  if (a === b) return fmtDay(a)
  const sameMonth = a.slice(0, 7) === b.slice(0, 7)
  return `${fmtDay(a, !sameMonth)}–${fmtDay(b)}`
}

// buildGroups splits the trip into runs of days that share a colour (country)
// and labels each with its dates and first named place.
function buildGroups(metas: DayMeta[]): DayGroup[] {
  const groups: DayGroup[] = []
  for (const m of metas) {
    const last = groups[groups.length - 1]
    if (last && last.color === m.color) {
      last.dates.push(m.date)
      if (!last.label && m.place) last.label = m.place
    } else {
      groups.push({ key: m.date, label: m.place || m.country, color: m.color, dates: [m.date] })
    }
  }
  return groups.map((g) => ({
    ...g,
    label: `${rangeLabel(g.dates[0], g.dates[g.dates.length - 1])}${g.label ? ` · ${g.label}` : ''}`,
  }))
}

type Show = 'planned' | 'happened'

// TripMapPage is the trip's Map tab (/trips/:tripId/map): a full-width map with
// pins numbered in visit order and coloured by country, an "Everything planned /
// What happened" switch, day-group chips (tap several to compare) plus per-day
// toggles, and a Stays view listing the bases in order with nights, booking
// status and the nights that still have no bed.
export function TripMapPage() {
  const { trip } = useTripShell()
  const [params] = useSearchParams()
  const dates = datesInRange(trip.start_date, trip.end_date)
  const order: ItemOrder = trip.end_date < localToday() ? 'actual' : 'plan'

  const [view, setView] = useState<'map' | 'stays'>(
    params.get('view') === 'stays' ? 'stays' : 'map',
  )
  const [entries, setEntries] = useState<DayEntry[] | null>(null)
  const [error, setError] = useState(false)
  const initialDay = params.get('day')
  const [selectedDates, setSelectedDates] = useState<Set<string>>(
    () => new Set(initialDay && dates.includes(initialDay) ? [initialDay] : []),
  )
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [show, setShow] = useState<Show>('planned')
  const [showSkipped, setShowSkipped] = useState(false)
  const [showDays, setShowDays] = useState(false)
  const [fitKey, setFitKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    Promise.all(dates.map((d, i) => loadDay(trip.id, d, i, order, controller.signal)))
      .then((loaded) => {
        if (controller.signal.aborted) return
        setEntries(loaded)
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        if (err instanceof UnauthorizedError) return
        setError(true)
      })
    return () => controller.abort()
    // trip.id is stable (TripShell remounts per trip); dates derive from it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip.id])

  const metas = useMemo(
    () =>
      entries
        ? buildDayMetas(
            dates,
            entries.map((e) => e.day),
          )
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entries],
  )
  const groups = useMemo(() => (metas ? buildGroups(metas) : []), [metas])

  // Days with resolved waypoints, coloured by country. Memoized so the array is
  // stable across pin selection (TripMap re-fits when it changes).
  const mapDays: TripDayMarkers[] = useMemo(
    () =>
      (entries ?? [])
        .filter((e) => e.waypoints.some(Boolean))
        .map((e) => ({
          date: e.date,
          index: e.index,
          color: metas?.[e.index]?.color ?? NO_COUNTRY_COLOR,
          items: e.items,
          waypoints: e.waypoints,
        })),
    [entries, metas],
  )
  const hasAnyPlace = mapDays.length > 0
  const hasSkipped = useMemo(() => mapDays.some((d) => d.items.some((it) => it.skipped)), [mapDays])

  // Visibility filters per day, keeping items and waypoints aligned. "What
  // happened" keeps only done pins; skipped stops hide unless asked for.
  const shownDays: TripDayMarkers[] = useMemo(() => {
    const happened = show === 'happened'
    if (!happened && showSkipped) return mapDays
    return mapDays
      .map((d) => {
        const keep = d.waypoints
          .map((w, j) => {
            const it = d.items[j]
            if (!w || !it) return -1
            if (!showSkipped && it.skipped) return -1
            if (happened && !it.done) return -1
            return j
          })
          .filter((j) => j >= 0)
        return {
          ...d,
          items: keep.map((j) => d.items[j]),
          waypoints: keep.map((j) => d.waypoints[j]),
        }
      })
      .filter((d) => d.waypoints.length > 0)
  }, [mapDays, show, showSkipped])
  const allHidden = hasAnyPlace && shownDays.length === 0

  const toggleDates = (ds: string[]) => {
    setSelectedDates((cur) => {
      const next = new Set(cur)
      const allOn = ds.every((d) => next.has(d))
      for (const d of ds) {
        if (allOn) next.delete(d)
        else next.add(d)
      }
      return next
    })
    setSelectedId(null)
  }
  const showAllDays = () => {
    setSelectedDates(new Set())
    setSelectedId(null)
  }

  return (
    <section className="fg-screen map-page" aria-label={`Map for ${trip.name}`}>
      <div className="fg-screen-head">
        <h1 className="fg-page-title">{view === 'map' ? 'Map' : 'Stays'}</h1>
        <div className="seg" role="group" aria-label="Map or stays">
          <button
            type="button"
            className="seg-btn"
            aria-pressed={view === 'map'}
            onClick={() => setView('map')}
          >
            Map
          </button>
          <button
            type="button"
            className="seg-btn"
            aria-pressed={view === 'stays'}
            onClick={() => setView('stays')}
          >
            Stays
          </button>
        </div>
      </div>

      {error ? (
        <p role="alert" className="fg-error">
          Could not load the trip map.
        </p>
      ) : entries === null || metas === null ? (
        <p className="fg-loading" aria-busy="true">
          Loading trip map…
        </p>
      ) : view === 'stays' ? (
        <StaysView entries={entries} metas={metas} />
      ) : (
        <div className="map-layout">
          <div className="map-frame">
            <Suspense
              fallback={
                <p className="fg-loading" aria-busy="true">
                  Loading map…
                </p>
              }
            >
              <TripMap
                days={shownDays}
                selectedDates={selectedDates}
                selectedId={selectedId}
                onSelect={setSelectedId}
                fitKey={fitKey}
                numbering="trip"
              />
            </Suspense>
            <button type="button" className="map-fit-btn" onClick={() => setFitKey((k) => k + 1)}>
              <Icon name="fit" size={16} />
              {selectedDates.size > 0 ? 'Fit to day' : 'Fit to trip'}
            </button>
            {(!hasAnyPlace || allHidden) && (
              <p className="map-overlay-note">
                {!hasAnyPlace
                  ? 'No places yet. Add a location to a stay or plan and its pin appears here.'
                  : show === 'happened'
                    ? 'Nothing ticked off yet. Places you tick off on the trip appear here, so the map becomes a record of where you actually went.'
                    : 'Every place here was skipped. Turn on “Show skipped” to see them.'}
              </p>
            )}
          </div>

          <div className="map-controls">
            <div className="seg seg--block" role="group" aria-label="Which places">
              <button
                type="button"
                className="seg-btn"
                aria-pressed={show === 'planned'}
                onClick={() => setShow('planned')}
              >
                Everything planned
              </button>
              <button
                type="button"
                className="seg-btn"
                aria-pressed={show === 'happened'}
                onClick={() => setShow('happened')}
              >
                What happened
              </button>
            </div>

            <div className="map-chips" role="group" aria-label="Days on the map">
              <button
                type="button"
                className="map-chip"
                aria-pressed={selectedDates.size === 0}
                onClick={showAllDays}
              >
                <span className="map-chip-dot" style={{ background: 'var(--ink)' }} />
                All days
              </button>
              {groups.map((g) => (
                <button
                  key={g.key}
                  type="button"
                  className="map-chip"
                  aria-pressed={g.dates.every((d) => selectedDates.has(d))}
                  onClick={() => toggleDates(g.dates)}
                >
                  <span className="map-chip-dot" style={{ background: g.color }} />
                  {g.label}
                </button>
              ))}
            </div>

            <p className="map-hint">
              Pins are numbered in the order you reach each place. Tap several days to compare them.
            </p>

            <div className="map-extra-toggles">
              <button
                type="button"
                className="fg-btn fg-btn--quiet"
                aria-expanded={showDays}
                onClick={() => setShowDays((s) => !s)}
              >
                {showDays ? 'Hide single days' : 'Pick single days'}
              </button>
              {hasSkipped && (
                <button
                  type="button"
                  className="fg-btn fg-btn--quiet"
                  aria-pressed={showSkipped}
                  onClick={() => setShowSkipped((s) => !s)}
                >
                  {showSkipped ? 'Hide skipped' : 'Show skipped'}
                </button>
              )}
            </div>

            {showDays && (
              <nav className="map-days" aria-label="Days">
                {entries.map((e) => {
                  const n = e.waypoints.filter(Boolean).length
                  return (
                    <button
                      key={e.date}
                      type="button"
                      className="map-day"
                      aria-pressed={selectedDates.has(e.date)}
                      disabled={n === 0}
                      onClick={() => toggleDates([e.date])}
                    >
                      <span className="map-chip-dot" style={{ background: metas[e.index].color }} />
                      <span className="map-day-label">
                        Day {e.index + 1} · {fmtDay(e.date)}
                      </span>
                      <span className="map-day-meta">
                        {e.status === 'no-places'
                          ? 'No places yet'
                          : e.status === 'unplaceable'
                            ? 'Couldn’t place this day’s locations'
                            : e.status === 'error'
                              ? 'Couldn’t load positions'
                              : `${n} ${n === 1 ? 'place' : 'places'}`}
                      </span>
                    </button>
                  )
                })}
              </nav>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

// StaysView lists the trip's bases in order: where you sleep, for how many
// nights, whether it's paid, and the runs of nights with no bed yet. Built
// from the stays already on each day (stayCoverage) — nothing new is stored.
function StaysView({ entries, metas }: { entries: DayEntry[]; metas: DayMeta[] }) {
  const { trip } = useTripShell()
  const packages = usePackages(trip.id)
  const dates = entries.map((e) => e.date)
  const runs = stayRuns(
    dates,
    entries.map((e) => e.day),
  )
  // A stay a paid package covers counts as paid.
  const covered = (id: string) => {
    const p = packageForStay(packages, id)
    return p ? { pkg: p, paid: isPaid(p) } : null
  }
  const booked = runs
    .filter((r) => r.kind === 'stay' && r.stay && (r.stay.paid || covered(r.stay.id)?.paid))
    .reduce((n, r) => n + r.nights, 0)
  const noBed = runs.filter((r) => r.kind === 'gap').reduce((n, r) => n + r.nights, 0)
  const bases = runs.filter((r) => r.kind === 'stay').length
  const transfers = entries.reduce(
    (n, e) => n + e.day.plan_items.filter((i) => (i.kind ?? 'activity') === 'transport').length,
    0,
  )
  const metaFor = (date: string) => metas[dates.indexOf(date)]

  if (runs.length === 0) {
    return <p className="fg-empty">A one-day trip has no nights to sleep anywhere.</p>
  }

  return (
    <div className="stays-view">
      <div className="fg-stats stays-stats" style={{ '--cols': 3 } as React.CSSProperties}>
        <div className="fg-stat fg-stat--ok">
          <span className="fg-stat-value">{booked}</span>
          <span className="fg-stat-label">nights paid</span>
        </div>
        <div className={noBed > 0 ? 'fg-stat fg-stat--warn' : 'fg-stat'}>
          <span className="fg-stat-value">{noBed}</span>
          <span className="fg-stat-label">nights with no bed yet</span>
        </div>
        <div className="fg-stat">
          <span className="fg-stat-value">{transfers > 0 ? transfers : bases}</span>
          <span className="fg-stat-label">{transfers > 0 ? 'journeys' : 'bases'}</span>
        </div>
      </div>

      <ol className="stays-list" aria-label="Stays in order">
        {runs.map((r) => {
          const meta = metaFor(r.start)
          const color = r.stay?.location
            ? countryColor(meta?.country)
            : (meta?.color ?? NO_COUNTRY_COLOR)
          const range = `${rangeLabel(r.start, r.end)} · ${r.nights} ${r.nights === 1 ? 'night' : 'nights'}`
          if (r.kind === 'gap') {
            return (
              <li key={`gap-${r.start}`} className="stays-item stays-item--gap">
                <span className="stays-dot stays-dot--open" style={{ borderColor: color }} />
                <span className="stays-body">
                  <Link
                    className="stays-name"
                    to={`/trips/${trip.id}/days/${r.start}`}
                    state={{ trip }}
                  >
                    {meta?.place || 'No stay yet'}
                  </Link>
                  <span className="stays-sub">{range}</span>
                </span>
                <span className="tag tag--warn">Find a bed</span>
              </li>
            )
          }
          const stay = r.stay!
          const inPkg = covered(stay.id)
          const status = inPkg ? 'Included' : stay.paid ? 'Paid' : stay.cost ? 'To pay' : ''
          return (
            <li key={`${stay.id}-${r.start}`} className="stays-item">
              <span className="stays-dot" style={{ background: color, borderColor: color }} />
              <span className="stays-body">
                <Link
                  className="stays-name"
                  to={`/trips/${trip.id}/days/${r.start}`}
                  state={{ trip }}
                >
                  {stay.location ? stay.location.split(',')[0] : stay.name}
                </Link>
                <span className="stays-sub">
                  {range}
                  {stay.location ? ` · ${stay.name}` : ''}
                  {inPkg ? ` · ${inPkg.pkg.name}` : stay.cost ? ` · ${euroWhole(stay.cost)}` : ''}
                </span>
              </span>
              {status && (
                <span className={inPkg || stay.paid ? 'tag tag--ok' : 'tag tag--warn'}>
                  {status}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
