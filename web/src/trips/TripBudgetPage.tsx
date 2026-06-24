import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  UnauthorizedError,
  fetchBudgetRollup,
  type BudgetLine,
  type BudgetRollup,
} from '../lib/api'
import { TripBudgetEditor } from './BudgetEditor'
import { useTripShell } from './useTripShell'

// TripBudgetPage renders the trip-level budget editor at /trips/:tripId/budget.
export function TripBudgetPage() {
  const { tripId } = useParams<{ tripId: string }>()
  const { trip } = useTripShell()
  const [rollup, setRollup] = useState<BudgetRollup | null>(null)
  const [lines, setLines] = useState<BudgetLine[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!tripId) return
    const controller = new AbortController()
    fetchBudgetRollup(tripId, controller.signal)
      .then((r) => setRollup(r))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        if (err instanceof UnauthorizedError) return
        setError('Could not load budget data.')
      })
    return () => controller.abort()
  }, [tripId])

  function handleLineUpdated(line: BudgetLine) {
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.id === line.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = line
        return next
      }
      return [...prev, line]
    })
  }

  const displayLines: BudgetLine[] = lines.map((l) => ({
    ...l,
    actual_amount: rollup?.by_category?.[l.category] ?? l.actual_amount,
  }))

  if (!tripId) return null

  return (
    <article className="trip-budget-page">
      <header className="trip-budget-header">
        <Link to={`/trips/${tripId}`} className="trip-budget-back" aria-label="Back to trip">
          ← Back
        </Link>
        <h2 className="trip-budget-title">{trip?.name ?? 'Trip'} — Budget</h2>
      </header>

      {error && (
        <p role="alert" className="trip-budget-error">
          {error}
        </p>
      )}

      {rollup && (
        <div className="trip-budget-summary">
          <span className="trip-budget-summary-label">Total spent:</span>
          <span className="trip-budget-summary-value">€{rollup.trip_total.toFixed(2)}</span>
        </div>
      )}

      <TripBudgetEditor tripId={tripId} lines={displayLines} onUpdated={handleLineUpdated} />
    </article>
  )
}
