import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { Link } from 'react-router-dom'
import {
  UnauthorizedError,
  datesInRange,
  fetchDay,
  type Day,
  type PlanItem,
  type Stay,
} from '../lib/api'
import { fullDate, shortDate } from '../lib/format'
import { PlanningSection } from './DayView'
import { JournalEditor } from '../journal/JournalEditor'
import { coversDay } from './stayCoverage'
import { useTripShell } from './useTripShell'
import { readCache, writeCache } from '../lib/resourceCache'
import { cacheKeys } from '../lib/cacheKeys'

// hasPlan reports whether a day has anything planned yet — an activity/note or a
// stay. Drives the filled rail dot so a glance shows which days still need work.
function hasPlan(day: Day): boolean {
  return day.plan_items.length > 0 || day.stays.length > 0
}

// dayCaption is the muted status line under each rail row.
function dayCaption(day: Day): string {
  const n = day.plan_items.length
  const s = day.stays.length
  if (n === 0 && s === 0) return 'Nothing planned yet'
  const parts: string[] = []
  if (n > 0) parts.push(`${n} ${n === 1 ? 'item' : 'items'}`)
  if (s > 0) parts.push(`${s} ${s === 1 ? 'stay' : 'stays'}`)
  return parts.join(' · ')
}

// TripPlanPage is the trip-scoped Plan subtab (/trips/:tripId/plan). It is a
// plan-only surface — no map, budget, or journal — mirroring the whole-trip Map
// and Journal subtabs. A left rail lists every day (with its plan status) plus a
// "Whole trip" row and a link to the ideas backlog. Selecting a day opens that
// day's full planner (reusing PlanningSection from the day view); "Whole trip"
// (the default) stacks every day's planner so you can add to and edit any day
// from one scroll. It loads each day once on mount.
export function TripPlanPage() {
  const { trip } = useTripShell()
  const dates = datesInRange(trip.start_date, trip.end_date)
  // A past trip's journal is read-only (matches the day view's behaviour).
  const isPast = trip.end_date < new Date().toISOString().slice(0, 10)

  const [days, setDays] = useState<Day[] | null>(null)
  const [error, setError] = useState(false)
  // selectedDate is the day being planned on the right; null means the whole-trip
  // stack (the landing view).
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    let done = false

    // Instant-render: if every day is already cached (shared per-day keys with
    // the day view, so a browsed trip is warm), paint the whole planner first,
    // then revalidate. A failed refresh with a full cache is non-destructive.
    void Promise.all(dates.map((d) => readCache<Day>(cacheKeys.day(trip.id, d)))).then((cached) => {
      if (done) return
      const cachedDays = cached.map((c) => c?.data).filter((d): d is Day => d != null)
      const hadFullCache = cachedDays.length === dates.length
      if (hadFullCache) setDays(cachedDays)

      return Promise.all(dates.map((d) => fetchDay(trip.id, d, controller.signal)))
        .then((loaded) => {
          if (done) return
          setDays(loaded)
          loaded.forEach((day) => void writeCache(cacheKeys.day(trip.id, day.date), day))
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') return
          if (err instanceof UnauthorizedError) return
          if (!hadFullCache) setError(true)
        })
    })

    return () => {
      done = true
      controller.abort()
    }
    // trip.id is stable (TripShell remounts per trip); dates derive from it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip.id])

  // setItemsForDate returns a Dispatch that mutates one day's plan_items in the
  // loaded list, so each PlanningSection can add/edit/reorder items in place and
  // the rail status stays in sync — the whole-trip stack shares one source.
  function setItemsForDate(date: string): Dispatch<SetStateAction<PlanItem[]>> {
    return (action) => {
      setDays((cur) =>
        cur
          ? cur.map((d) =>
              d.date === date
                ? {
                    ...d,
                    plan_items:
                      typeof action === 'function'
                        ? (action as (prev: PlanItem[]) => PlanItem[])(d.plan_items)
                        : action,
                  }
                : d,
            )
          : cur,
      )
    }
  }

  // setStaysForDate mirrors setItemsForDate for a day's stays so the pinned stay
  // slot in each PlanningSection updates the shared loaded list in place.
  function setStaysForDate(date: string): Dispatch<SetStateAction<Stay[]>> {
    return (action) => {
      setDays((cur) =>
        cur
          ? cur.map((d) =>
              d.date === date
                ? {
                    ...d,
                    stays:
                      typeof action === 'function'
                        ? (action as (prev: Stay[]) => Stay[])(d.stays)
                        : action,
                  }
                : d,
            )
          : cur,
      )
    }
  }

  // applyStay spreads a saved stay across every day it now covers and drops it
  // from days it no longer covers. Because all days are held in memory here, a
  // two-night stay added on day 1 shows on day 2 immediately — no reload. The
  // backend already returns a stay on every covered day; this keeps the loaded
  // list in step after a local add/edit.
  function applyStay(saved: Stay) {
    setDays((cur) =>
      cur
        ? cur.map((d) => {
            const rest = d.stays.filter((s) => s.id !== saved.id)
            return { ...d, stays: coversDay(saved, d.date) ? [saved] : rest }
          })
        : cur,
    )
  }

  // removeStay drops a deleted stay from every day it occupied.
  function removeStay(stayId: string) {
    setDays((cur) =>
      cur ? cur.map((d) => ({ ...d, stays: d.stays.filter((s) => s.id !== stayId) })) : cur,
    )
  }

  const selected = days?.find((d) => d.date === selectedDate) ?? null
  const totalItems = (days ?? []).reduce((sum, d) => sum + d.plan_items.length, 0)

  return (
    <article className="trip-plan-page" aria-label={`Days for ${trip.name}`}>
      <div className="screen-content trip-plan-body">
        <header className="trip-plan-head">
          <h1 className="h1">Your trip, day by day</h1>
          <p className="meta">
            Plan a day, log what you actually did, and journal it — or scan the whole trip at once.
          </p>
        </header>

        {error ? (
          <p role="alert" className="trip-plan-error">
            Could not load the trip plan.
          </p>
        ) : days === null ? (
          <p className="trip-plan-loading" aria-busy="true">
            Loading trip plan…
          </p>
        ) : (
          <div className="trip-plan-layout">
            <nav className="trip-plan-days" aria-label="Days">
              <button
                type="button"
                className={['trip-plan-day', selectedDate === null ? 'trip-plan-day--active' : '']
                  .filter(Boolean)
                  .join(' ')}
                aria-pressed={selectedDate === null}
                onClick={() => setSelectedDate(null)}
              >
                <span className="trip-plan-day-dot trip-plan-day-dot--all" aria-hidden="true" />
                <span className="trip-plan-day-label">Whole trip</span>
                <span className="trip-plan-day-meta">
                  {totalItems > 0
                    ? `${totalItems} ${totalItems === 1 ? 'item' : 'items'} planned`
                    : 'Plan the whole trip'}
                </span>
              </button>
              {days.map((d) => (
                <button
                  key={d.date}
                  type="button"
                  className={[
                    'trip-plan-day',
                    selectedDate === d.date ? 'trip-plan-day--active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-pressed={selectedDate === d.date}
                  onClick={() => setSelectedDate(d.date)}
                >
                  <span
                    className={['trip-plan-day-dot', hasPlan(d) ? 'trip-plan-day-dot--filled' : '']
                      .filter(Boolean)
                      .join(' ')}
                    aria-hidden="true"
                  />
                  <span className="trip-plan-day-label">
                    Day {d.index + 1} · {shortDate(d.date)}
                  </span>
                  <span className="trip-plan-day-meta">{dayCaption(d)}</span>
                </button>
              ))}
              <Link
                to={`/trips/${trip.id}/backlog`}
                state={{ trip }}
                className="trip-plan-backlog"
                aria-label="View ideas backlog"
              >
                💡 Ideas backlog
              </Link>
            </nav>

            <div className="trip-plan-panel">
              {selected ? (
                <div className="trip-day-panel">
                  <PlanningSection
                    key={selected.id}
                    day={selected}
                    items={selected.plan_items}
                    setItems={setItemsForDate(selected.date)}
                    setStays={setStaysForDate(selected.date)}
                    onStaySaved={applyStay}
                    onStayRemoved={removeStay}
                    tripId={trip.id}
                    title={`Day ${selected.index + 1} · ${fullDate(selected.date)}`}
                    showBacklogLink={false}
                  />
                  <section className="trip-day-journal" aria-label="Journal">
                    <h2 className="day-slot-title">Journal</h2>
                    <JournalEditor
                      key={`journal-${selected.id}`}
                      tripId={trip.id}
                      dayId={selected.id}
                      readOnly={isPast}
                    />
                  </section>
                </div>
              ) : (
                <div className="trip-plan-feed">
                  {days.map((d) => (
                    <PlanningSection
                      key={d.id}
                      day={d}
                      items={d.plan_items}
                      setItems={setItemsForDate(d.date)}
                      setStays={setStaysForDate(d.date)}
                      onStaySaved={applyStay}
                      onStayRemoved={removeStay}
                      tripId={trip.id}
                      title={`Day ${d.index + 1} · ${shortDate(d.date)}`}
                      showBacklogLink={false}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </article>
  )
}
