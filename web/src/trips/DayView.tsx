import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { UnauthorizedError, fetchDay, type Day } from '../lib/api'

// PlanningSlot is the stable mount point Milestone 04 fills with the day's plan
// items. The `data-slot` attribute gives later milestones a stable selector.
function PlanningSlot() {
  return (
    <section className="day-slot day-slot-planning" aria-label="Planning" data-slot="planning">
      <h2 className="day-slot-title">Planning</h2>
      <p className="day-slot-placeholder">Plan items coming in Milestone 04</p>
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
// It fetches the day from the API, shows its metadata, and renders four stable
// mount-point slots (planning, budget, journal, map) that later milestones fill.
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
        <PlanningSlot />
        <BudgetSlot />
        <JournalSlot />
        <MapSlot />
      </div>
    </article>
  )
}
