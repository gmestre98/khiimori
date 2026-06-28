import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { Trip } from '../lib/api'

function todayDayNumber(startDate: string): number | null {
  const start = new Date(startDate + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.floor((today.getTime() - start.getTime() + 12 * 3_600_000) / 86_400_000)
  if (diff < 0) return null
  return diff + 1
}

function totalDays(startDate: string, endDate: string): number {
  const start = new Date(startDate + 'T00:00:00')
  const end = new Date(endDate + 'T00:00:00')
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1)
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
  const dateRange = `${trip.start_date} – ${trip.end_date}`

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
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
                gap: 8,
                flexShrink: 0,
              }}
            >
              <Link
                to={`/trips/${trip.id}`}
                state={{ trip }}
                className="btn-accent"
                style={{ fontSize: 12, padding: '6px 12px' }}
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

          {/* Archive / delete controls */}
          <div className="trip-card-actions" style={{ marginTop: 'var(--s3)' }}>
            <Link
              to={`/trips/${trip.id}/edit`}
              state={{ trip }}
              className="trip-card-edit-link"
              aria-label={`Edit ${trip.name}`}
            >
              Edit
            </Link>
            {onArchive && (
              <button
                className="btn-ghost btn-sm"
                onClick={onArchive}
                aria-label={`Archive ${trip.name}`}
              >
                Archive
              </button>
            )}
            {onDelete && (
              <button
                className="btn-ghost-danger"
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
