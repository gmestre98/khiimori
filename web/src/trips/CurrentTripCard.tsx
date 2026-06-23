import type { ReactNode } from 'react'
import type { Trip } from '../lib/api'

// todayDayNumber returns the 1-based day number for today within the trip, or
// null if today is somehow outside the trip range. The trip's start_date string
// (YYYY-MM-DD) is server-provided, making the result consistent across clients.
function todayDayNumber(startDate: string): number | null {
  const start = new Date(startDate + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((today.getTime() - start.getTime()) / 86_400_000)
  if (diff < 0) return null
  return diff + 1
}

// BudgetGlanceSlot is the stable placeholder boundary that Milestone 05 fills
// with real budget figures. The slot prop defaults to a neutral placeholder so
// the card renders without any budget data.
// BudgetGlanceSlot is the stable placeholder boundary that Milestone 05 fills
// with real budget figures. Uses <section> so it gets role=region and can be
// found by aria-label in tests and assistive technology.
function BudgetGlanceSlot({ children }: { children?: ReactNode }) {
  return (
    <section className="current-trip-budget-slot" aria-label="Budget glance">
      {children ?? <span className="current-trip-budget-placeholder">Budget overview coming soon</span>}
    </section>
  )
}

// CurrentTripCard renders the current trip prominently: trip name, destinations,
// today's day number, and a budget-glance slot. Pass budgetGlance to fill the
// slot with real figures (Milestone 05); omit it for the placeholder.
export function CurrentTripCard({
  trip,
  budgetGlance,
}: {
  trip: Trip
  budgetGlance?: ReactNode
}) {
  const dayNumber = todayDayNumber(trip.start_date)
  const destinations = trip.destinations.join(', ')

  return (
    <section className="current-trip-card" aria-label="Current trip">
      {trip.cover && (
        <img src={trip.cover} alt="" className="current-trip-cover" aria-hidden="true" />
      )}
      <div className="current-trip-body">
        <p className="current-trip-label">Current trip</p>
        <h2 className="current-trip-name">{trip.name}</h2>
        {destinations && <p className="current-trip-destinations">{destinations}</p>}
        {dayNumber !== null && (
          <p className="current-trip-day-number">Day {dayNumber}</p>
        )}
        <BudgetGlanceSlot>{budgetGlance}</BudgetGlanceSlot>
      </div>
    </section>
  )
}
