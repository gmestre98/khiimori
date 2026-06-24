import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { UnauthorizedError, fetchDay, type Day, type PlanItem, type Stay } from '../lib/api'

// statusLabel maps a plan item status to a human-readable label.
function statusLabel(status: string): string {
  switch (status) {
    case 'done':
      return 'Done'
    case 'skipped':
      return 'Skipped'
    case 'cancelled':
      return 'Cancelled'
    default:
      return ''
  }
}

// PlanItemRow renders a single plan item. Status (done/skipped/cancelled) is
// reflected visually via a CSS class so each state is distinguishable at a glance.
function PlanItemRow({ item }: { item: PlanItem }) {
  const isDone = item.status === 'done'
  const isSkipped = item.status === 'skipped'
  const isCancelled = item.status === 'cancelled'
  const inactive = isSkipped || isCancelled
  const label = statusLabel(item.status)

  return (
    <li
      className={[
        'plan-item',
        isDone ? 'plan-item--done' : '',
        isSkipped ? 'plan-item--skipped' : '',
        isCancelled ? 'plan-item--cancelled' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={item.title + (label ? ` — ${label}` : '')}
    >
      <span className="plan-item-title" style={inactive ? { opacity: 0.5 } : undefined}>
        {item.title}
      </span>
      {item.start_time && (
        <span className="plan-item-time" aria-label={`Start time: ${item.start_time}`}>
          {item.start_time.slice(0, 5)}
        </span>
      )}
      {item.location && <span className="plan-item-location">{item.location}</span>}
      {label && <span className="plan-item-status-badge">{label}</span>}
    </li>
  )
}

// TimedSection renders plan items that have a start_time in chronological order.
function TimedSection({ items }: { items: PlanItem[] }) {
  if (items.length === 0) return null
  return (
    <section className="day-plan-section day-plan-section--timed" aria-label="Timed activities">
      <h3 className="day-plan-section-title">Schedule</h3>
      <ol className="plan-item-list">
        {items.map((item) => (
          <PlanItemRow key={item.id} item={item} />
        ))}
      </ol>
    </section>
  )
}

// UntimedSection renders plan items without a start_time as a loose list.
function UntimedSection({ items }: { items: PlanItem[] }) {
  if (items.length === 0) return null
  return (
    <section className="day-plan-section day-plan-section--untimed" aria-label="Untimed activities">
      <h3 className="day-plan-section-title">Activities</h3>
      <ul className="plan-item-list">
        {items.map((item) => (
          <PlanItemRow key={item.id} item={item} />
        ))}
      </ul>
    </section>
  )
}

// StaysSection renders accommodation stays covering this day.
function StaysSection({ stays }: { stays: Stay[] }) {
  if (stays.length === 0) return null
  return (
    <section className="day-stays-section" aria-label="Accommodation">
      <h3 className="day-stays-section-title">Staying</h3>
      <ul className="stay-list">
        {stays.map((stay) => (
          <li key={stay.id} className="stay-item">
            <span className="stay-name">{stay.name}</span>
            {stay.location && <span className="stay-location">{stay.location}</span>}
            {stay.check_in && stay.check_out && (
              <span
                className="stay-dates"
                aria-label={`Check in ${stay.check_in}, check out ${stay.check_out}`}
              >
                {stay.check_in} – {stay.check_out}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

// BacklogLink renders a link/button to access the ideas backlog for the trip.
function BacklogLink({ tripId }: { tripId: string }) {
  return (
    <section className="day-backlog-section" aria-label="Ideas backlog">
      <Link
        to={`/trips/${tripId}/backlog`}
        className="day-backlog-link"
        aria-label="View ideas backlog"
      >
        💡 Ideas backlog
      </Link>
    </section>
  )
}

// PlanningSection replaces the old PlanningSlot placeholder with real content:
// stays, timed items, untimed items, and a link to the ideas backlog.
function PlanningSection({ day, tripId }: { day: Day; tripId: string }) {
  const timed = day.plan_items.filter((item) => item.start_time != null)
  const untimed = day.plan_items.filter((item) => item.start_time == null)

  return (
    <section className="day-slot day-slot-planning" aria-label="Planning" data-slot="planning">
      <h2 className="day-slot-title">Plan</h2>
      <StaysSection stays={day.stays} />
      <TimedSection items={timed} />
      <UntimedSection items={untimed} />
      {day.plan_items.length === 0 && day.stays.length === 0 && (
        <p className="day-plan-empty">Nothing planned yet.</p>
      )}
      <BacklogLink tripId={tripId} />
    </section>
  )
}

// BudgetSlot is the stable mount point Milestone 05 fills with per-day budget
// figures.
function BudgetSlot() {
  return (
    <section className="day-slot day-slot-budget" aria-label="Budget" data-slot="budget">
      <h2 className="day-slot-title">Budget</h2>
      <p className="day-slot-placeholder">Budget breakdown coming in Milestone 05</p>
    </section>
  )
}

// JournalSlot is the stable mount point Milestone 06 fills with journal entries.
function JournalSlot() {
  return (
    <section className="day-slot day-slot-journal" aria-label="Journal" data-slot="journal">
      <h2 className="day-slot-title">Journal</h2>
      <p className="day-slot-placeholder">Journal entries coming in Milestone 06</p>
    </section>
  )
}

// MapSlot is the stable mount point Milestone 07 fills with the day's map view.
function MapSlot() {
  return (
    <section className="day-slot day-slot-map" aria-label="Map" data-slot="map">
      <h2 className="day-slot-title">Map</h2>
      <p className="day-slot-placeholder">Map view coming in Milestone 07</p>
    </section>
  )
}

// DayView renders a single trip day identified by /trips/:tripId/days/:date.
// It fetches the day from the API, shows its metadata, and renders the planning
// section (stays, timed/untimed items, backlog link) plus placeholder slots
// for Budget (M05), Journal (M06), and Map (M07).
export function DayView() {
  const { tripId, date } = useParams<{ tripId: string; date: string }>()

  const [day, setDay] = useState<Day | null>(null)
  // fetchError is scoped to a date so stale errors from a previous date are
  // not shown when the user navigates to a new day (avoids synchronous resets).
  const [fetchError, setFetchError] = useState<{ date: string; msg: string } | null>(null)

  // Derive loading: we are loading when neither a day result nor an error for
  // the current date param is available yet — no synchronous setState needed.
  const loading = day?.date !== date && fetchError?.date !== date
  const error = fetchError !== null && fetchError.date === date ? fetchError.msg : null

  useEffect(() => {
    if (!tripId || !date) return
    const controller = new AbortController()

    fetchDay(tripId, date, controller.signal)
      .then((d) => {
        setDay(d)
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        if (err instanceof UnauthorizedError) return
        setFetchError({ date, msg: 'Could not load day.' })
      })

    return () => controller.abort()
  }, [tripId, date])

  // day.index is 0-based (server-provided); +1 gives the 1-based display number.
  const dayNumber = day ? day.index + 1 : null

  return (
    <article className="day-view" aria-label={date ? `Day ${dayNumber ?? ''} — ${date}` : 'Day'}>
      <header className="day-view-header">
        <h2 className="day-view-title">{dayNumber !== null ? `Day ${dayNumber}` : 'Day'}</h2>
        {date && (
          <time className="day-view-date" dateTime={date}>
            {date}
          </time>
        )}
      </header>

      {loading && (
        <p className="day-view-loading" aria-busy="true">
          Loading day…
        </p>
      )}
      {error && (
        <p role="alert" className="day-view-error">
          {error}
        </p>
      )}
      {day?.notes && <p className="day-view-notes">{day.notes}</p>}

      {/* Stable mount points for Milestones 04–07. Order matches the day plan
          layout in assets/02-day-plan-map.svg (PRD §4.2). */}
      <div className="day-slots">
        {day && tripId ? (
          <PlanningSection day={day} tripId={tripId} />
        ) : (
          <section
            className="day-slot day-slot-planning"
            aria-label="Planning"
            data-slot="planning"
          >
            <h2 className="day-slot-title">Plan</h2>
          </section>
        )}
        <BudgetSlot />
        <JournalSlot />
        <MapSlot />
      </div>
    </article>
  )
}
