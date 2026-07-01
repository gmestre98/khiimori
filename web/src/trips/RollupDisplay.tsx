import type { BudgetRollup } from '../lib/api'
import { BUDGET_CATEGORIES } from '../lib/api'
import { euro as fmt, euroWhole as fmtWhole } from '../lib/format'

// Category swatch colors map to the design tokens (--cat-*).
const CATEGORY_COLOR: Record<string, string> = {
  stays: 'var(--cat-stays)',
  transport: 'var(--cat-transport)',
  food: 'var(--cat-food)',
  activities: 'var(--cat-activities)',
  other: 'var(--cat-other)',
}

// BudgetSummaryTiles renders the three headline tiles from the design reference:
// Spent · Remaining (the teal number you watch) · Trip budget.
export function BudgetSummaryTiles({ rollup }: { rollup: BudgetRollup }) {
  const spent = rollup.trip_total
  const budget = rollup.planned_trip_total
  const remaining = budget - spent
  const pct = budget > 0 ? Math.round((spent / budget) * 100) : 0

  return (
    <div className="budget-tiles" aria-label="Budget summary">
      <div className="budget-tile card pad">
        <div className="meta">Spent</div>
        <div className="budget-tile-value num">{fmtWhole(spent)}</div>
        {budget > 0 && <div className="meta mt1">{pct}% of budget</div>}
      </div>
      <div className="budget-tile card pad">
        <div className="meta">Remaining</div>
        <div className="budget-tile-value budget-tile-value--accent num">{fmtWhole(remaining)}</div>
        {budget > 0 && (
          <div className="meta mt1">{remaining >= 0 ? 'left to spend' : 'over budget'}</div>
        )}
      </div>
      <div className="budget-tile card pad">
        <div className="meta">Trip budget</div>
        <div className="budget-tile-value num">{fmtWhole(budget)}</div>
        <div className="meta mt1">planned total</div>
      </div>
    </div>
  )
}

// SpendBar renders a simple progress bar. pct is clamped to [0, 100].
// When planned is 0, only the spent pip is shown without a bar track.
// Non-finite inputs (from a partial/empty rollup) are coerced to 0.
function SpendBar({ spent, planned }: { spent: number; planned: number }) {
  spent = Number.isFinite(spent) ? spent : 0
  planned = Number.isFinite(planned) ? planned : 0
  if (planned <= 0) {
    return (
      <div
        className="rollup-bar rollup-bar--no-budget"
        aria-label={`Spent ${fmt(spent)}, no budget set`}
      >
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
function RollupRow({ label, spent, planned }: { label: string; spent: number; planned: number }) {
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

// CategoryMeter renders one category row in the design reference's by-category
// style: a color swatch + label, the spent/planned amounts (warn/danger colored),
// and a thin progress meter that turns warn at 80% and danger at/over 100%.
function CategoryMeter({
  category,
  spent,
  planned,
}: {
  category: string
  spent: number
  planned: number
}) {
  const pct = planned > 0 ? Math.min(100, (spent / planned) * 100) : spent > 0 ? 100 : 0
  const ratio = planned > 0 ? spent / planned : 0
  const state = ratio >= 1 ? 'danger' : ratio >= 0.8 ? 'warn' : 'ok'
  const amountColor =
    state === 'danger' ? 'var(--danger)' : state === 'warn' ? 'var(--warn)' : 'var(--ink)'
  const label = category.charAt(0).toUpperCase() + category.slice(1)
  const color = CATEGORY_COLOR[category.toLowerCase()] ?? 'var(--cat-other)'
  return (
    <div className="rollup-cat">
      <div className="row between mb2">
        <div className="row gap2">
          <span className="rollup-cat-swatch" style={{ background: color }} />
          <b className="rollup-cat-label">{label}</b>
        </div>
        <span className="num meta">
          <b style={{ color: amountColor }}>{fmt(spent)}</b>
          {planned > 0 && <> / {fmt(planned)}</>}
        </span>
      </div>
      <div className={['progress', 'thin', state === 'ok' ? '' : state].filter(Boolean).join(' ')}>
        <span style={{ width: `${pct}%` }} />
      </div>
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

  const isEmpty =
    rollup.trip_total === 0 && rollup.planned_trip_total === 0 && categoryRows.length === 0

  return (
    <div className="trip-rollup">
      {categoryRows.length > 0 && (
        <section className="card rollup-card" aria-label="By category">
          <div className="rollup-card-head row between">
            <span className="eyebrow">By category</span>
            <span className="meta">Spent / Planned</span>
          </div>
          <div className="rollup-card-body">
            {categoryRows.map(({ cat, spent, planned }) => (
              <CategoryMeter key={cat} category={cat} spent={spent} planned={planned} />
            ))}
          </div>
        </section>
      )}

      {isEmpty && <p className="rollup-empty">No costs recorded yet.</p>}
    </div>
  )
}

// DayRollup shows the per-day rollup for a single day: per-category breakdown.
export function DayRollup({ rollup, dayId }: { rollup: BudgetRollup; dayId: string }) {
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
        <span className="budget-glance-label">Trip budget</span>
        <span className="budget-glance-amounts num">
          <b className="budget-glance-value">{fmtWhole(spent)}</b>
          {planned > 0 && (
            <>
              <span className="budget-glance-sep"> / </span>
              <span className="budget-glance-planned">{fmtWhole(planned)}</span>
              {remaining !== null && (
                <span
                  className={`budget-glance-left${remaining < 0 ? ' budget-glance-left--over' : ''}`}
                >
                  {' · '}
                  {remaining >= 0 ? `${fmtWhole(remaining)} left` : `${fmtWhole(-remaining)} over`}
                </span>
              )}
            </>
          )}
        </span>
      </div>
      <SpendBar spent={spent} planned={planned} />
    </div>
  )
}
