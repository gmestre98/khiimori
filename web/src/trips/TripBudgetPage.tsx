import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  UnauthorizedError,
  fetchBudgetRollup,
  type BudgetLine,
  type BudgetRollup,
} from '../lib/api'
import { TripBudgetEditor } from './BudgetEditor'
import { TripRollup, BudgetSummaryTiles } from './RollupDisplay'

// TripBudgetPage renders the trip-level budget editor and rollup display.
export function TripBudgetPage() {
  const { tripId } = useParams<{ tripId: string }>()
  const [rollup, setRollup] = useState<BudgetRollup | null>(null)
  const [lines, setLines] = useState<BudgetLine[]>([])
  const [error, setError] = useState<string | null>(null)

  const loadRollup = useCallback(
    (signal?: AbortSignal) => {
      if (!tripId) return
      fetchBudgetRollup(tripId, signal)
        .then((r) => setRollup(r))
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') return
          if (err instanceof UnauthorizedError) return
          setError('Could not load budget data.')
        })
    },
    [tripId],
  )

  useEffect(() => {
    const controller = new AbortController()
    loadRollup(controller.signal)
    return () => controller.abort()
  }, [loadRollup])

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
    // Re-fetch rollup so planned totals reflect the new line immediately.
    loadRollup()
  }

  if (!tripId) return null

  return (
    <article className="trip-budget-page">
      <div className="screen-content narrow trip-budget-body">
        <h1 className="h1 trip-budget-title">Budget</h1>
        {error && (
          <p role="alert" className="trip-budget-error">
            {error}
          </p>
        )}

        {rollup && <BudgetSummaryTiles rollup={rollup} />}

        {rollup && <TripRollup rollup={rollup} />}

        <TripBudgetEditor tripId={tripId} lines={lines} onUpdated={handleLineUpdated} />
      </div>
    </article>
  )
}
