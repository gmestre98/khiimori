import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { Trip } from '../lib/api'
import { formatDateRange, tripDayCount } from '../lib/format'

function todayDayNumber(startDate: string): number | null {
  const start = new Date(startDate + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.floor((today.getTime() - start.getTime() + 12 * 3_600_000) / 86_400_000)
  if (diff < 0) return null
  return diff + 1
}

function totalDays(startDate: string, endDate: string): number {
  return tripDayCount(startDate, endDate)
}

// BudgetGlanceSlot holds the budget data injected by the parent
function BudgetGlanceSlot({ children }: { children?: ReactNode }) {
  return (
    <section className="current-trip-budget-slot" aria-label="Budget glance">
      {children ?? (
        <span className="current-trip-budget-placeholder">Budget overview loading…</span>
      )}
    </section>
  )
}

export function CurrentTripCard({
  trip,
  budgetGlance,
  onArchive,
  onDelete,
}: {
  trip: Trip
  budgetGlance?: ReactNode
  onArchive?: () => void
  onDelete?: () => void
}) {
  const dayNumber = todayDayNumber(trip.start_date)
  const total = totalDays(trip.start_date, trip.end_date)
  const destinations = trip.destinations.join(' · ')
  const dateRange = formatDateRange(trip.start_date, trip.end_date)

  return (
    <section className="current-trip-card" aria-label="Current trip">
      <div className="current-trip-card-inner">
        {/* Teal panel — day counter */}
        <div className="current-trip-panel" aria-hidden="true">
          <div className="current-trip-panel-glow" />
          <div className="current-trip-panel-label">
            <div className="current-trip-panel-now">Now</div>
            <div className="current-trip-panel-day">
              {dayNumber !== null ? `Day ${dayNumber} / ${total}` : `${total} days`}
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="current-trip-body">
          <div className="current-trip-header">
            <div>
              <span className="chip chip--accent" style={{ fontSize: 11 }}>
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: 'currentColor',
                    display: 'inline-block',
                    flexShrink: 0,
                  }}
                />
                Today{destinations ? ` · ${trip.destinations[0]}` : ''}
              </span>
              <h2 className="current-trip-name">{trip.name}</h2>
              <p className="current-trip-meta num">
                {destinations && `${destinations} · `}
                {dateRange}
              </p>
            </div>
            <div className="current-trip-header-cta">
              <Link
                to={`/trips/${trip.id}`}
                state={{ trip }}
                className="btn-accent current-trip-open"
                aria-label={`Open today in ${trip.name}`}
              >
                Open today →
              </Link>
            </div>
          </div>

          {/* Budget / stats row */}
          <div className="current-trip-footer">
            <div className="current-trip-budget">
              <BudgetGlanceSlot>{budgetGlance}</BudgetGlanceSlot>
            </div>
          </div>

          {/* Secondary controls — kept quiet so the hero stays calm (design §04). */}
          <div className="current-trip-actions">
            <Link
              to={`/trips/${trip.id}/edit`}
              state={{ trip }}
              className="current-trip-action"
              aria-label={`Edit ${trip.name}`}
            >
              Edit
            </Link>
            {onArchive && (
              <button
                type="button"
                className="current-trip-action"
                onClick={onArchive}
                aria-label={`Archive ${trip.name}`}
              >
                Archive
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                className="current-trip-action current-trip-action--danger"
                onClick={onDelete}
                aria-label={`Delete ${trip.name}`}
              >
                Delete
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
