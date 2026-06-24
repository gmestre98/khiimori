import type { BudgetRollup } from '../lib/api'
import { BUDGET_CATEGORIES } from '../lib/api'

function fmt(n: number): string {
  return `€${n.toFixed(2)}`
}

// SpendBar renders a simple progress bar. pct is clamped to [0, 100].
// When planned is 0, only the spent pip is shown without a bar track.
function SpendBar({ spent, planned }: { spent: number; planned: number }) {
  if (planned <= 0) {
    return (
      <div className="rollup-bar rollup-bar--no-budget" aria-label={`Spent ${fmt(spent)}, no budget set`}>
        <div className="rollup-bar-spend-only" />
      </div>
    )
  }
  const pct = Math.min(100, (spent / planned) * 100)
  const over = spent > planned
  return (
    <div
      className="rollup-bar"
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Spent ${fmt(spent)} of ${fmt(planned)}`}
    >
      <div
        className={`rollup-bar-fill${over ? ' rollup-bar-fill--over' : ''}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

// RollupRow renders one labelled row: label | bar | spent / planned | remaining.
function RollupRow({
  label,
  spent,
  planned,
}: {
  label: string
  spent: number
  planned: number
}) {
  const remaining = planned > 0 ? planned - spent : null
  return (
    <div className="rollup-row">
      <span className="rollup-row-label">{label}</span>
      <SpendBar spent={spent} planned={planned} />
      <span className="rollup-row-amounts">
        <span className="rollup-row-spent">{fmt(spent)}</span>
        {planned > 0 && (
          <>
            <span className="rollup-row-sep"> / </span>
            <span className="rollup-row-planned">{fmt(planned)}</span>
          </>
        )}
      </span>
      {remaining !== null && (
        <span
          className={`rollup-row-remaining${remaining < 0 ? ' rollup-row-remaining--over' : ''}`}
        >
          {remaining >= 0 ? `${fmt(remaining)} left` : `${fmt(-remaining)} over`}
        </span>
      )}
    </div>
  )
}

// TripRollup shows the full three-level rollup: trip total, by category, by day.
export function TripRollup({ rollup }: { rollup: BudgetRollup }) {
  const categoryRows = BUDGET_CATEGORIES.map((cat) => ({
    cat,
    spent: rollup.by_category[cat] ?? 0,
    planned: rollup.planned_by_category[cat] ?? 0,
  })).filter(({ spent, planned }) => spent > 0 || planned > 0)

  // Day rows: sort by date string (UUIDs don't sort meaningfully, but the server
  // stores dates so we pair them if we can, else show the UUID truncated).
  const dayIds = Object.keys(rollup.by_day)
  const hasDayPlanned = Object.keys(rollup.planned_by_day).length > 0
  const allDayIds = hasDayPlanned
    ? [...new Set([...dayIds, ...Object.keys(rollup.planned_by_day)])]
    : dayIds

  return (
    <div className="trip-rollup">
      <section className="rollup-section" aria-label="Trip total">
        <h3 className="rollup-section-title">Trip total</h3>
        <RollupRow
          label="Total"
          spent={rollup.trip_total}
          planned={rollup.planned_trip_total}
        />
      </section>

      {categoryRows.length > 0 && (
        <section className="rollup-section" aria-label="By category">
          <h3 className="rollup-section-title">By category</h3>
          {categoryRows.map(({ cat, spent, planned }) => (
            <RollupRow key={cat} label={cat} spent={spent} planned={planned} />
          ))}
        </section>
      )}

      {allDayIds.length > 0 && (
        <section className="rollup-section" aria-label="By day">
          <h3 className="rollup-section-title">By day</h3>
          {allDayIds.map((id) => (
            <RollupRow
              key={id}
              label={id.slice(0, 8)}
              spent={rollup.by_day[id] ?? 0}
              planned={rollup.planned_by_day[id] ?? 0}
            />
          ))}
        </section>
      )}

      {rollup.trip_total === 0 && categoryRows.length === 0 && (
        <p className="rollup-empty">No costs recorded yet.</p>
      )}
    </div>
  )
}

// DayRollup shows the per-day rollup for a single day: per-category breakdown.
export function DayRollup({
  rollup,
  dayId,
}: {
  rollup: BudgetRollup
  dayId: string
}) {
  const daySpent = rollup.by_day[dayId] ?? 0
  const dayPlanned = rollup.planned_by_day[dayId] ?? 0
  const dayCategories = rollup.by_day_category[dayId] ?? {}

  const catRows = BUDGET_CATEGORIES.map((cat) => ({
    cat,
    spent: dayCategories[cat] ?? 0,
    planned: 0, // day-category planned not yet exposed; show spend-only
  })).filter(({ spent }) => spent > 0)

  if (daySpent === 0 && dayPlanned === 0) return null

  return (
    <div className="day-rollup">
      <RollupRow label="Day total" spent={daySpent} planned={dayPlanned} />
      {catRows.map(({ cat, spent, planned }) => (
        <RollupRow key={cat} label={cat} spent={spent} planned={planned} />
      ))}
    </div>
  )
}

// BudgetGlance is the compact summary for the dashboard slot: spent vs. planned.
export function BudgetGlance({ rollup }: { rollup: BudgetRollup }) {
  const spent = rollup.trip_total
  const planned = rollup.planned_trip_total
  const remaining = planned > 0 ? planned - spent : null

  return (
    <div className="budget-glance">
      <div className="budget-glance-row">
        <span className="budget-glance-label">Spent</span>
        <span className="budget-glance-value">{fmt(spent)}</span>
        {planned > 0 && (
          <>
            <span className="budget-glance-sep"> of </span>
            <span className="budget-glance-planned">{fmt(planned)}</span>
          </>
        )}
      </div>
      <SpendBar spent={spent} planned={planned} />
      {remaining !== null && (
        <div
          className={`budget-glance-remaining${remaining < 0 ? ' budget-glance-remaining--over' : ''}`}
        >
          {remaining >= 0 ? `${fmt(remaining)} remaining` : `${fmt(-remaining)} over budget`}
        </div>
      )}
    </div>
  )
}
