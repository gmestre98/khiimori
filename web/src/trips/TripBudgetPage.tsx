import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  UnauthorizedError,
  datesInRange,
  fetchBudgetRollup,
  fetchDay,
  listCostEntries,
  type BudgetLine,
  type BudgetRollup,
  type CostEntry,
} from '../lib/api'
import { TripBudgetEditor, TripDayExtra } from './BudgetEditor'
import { TripRollup, BudgetSummaryTiles } from './RollupDisplay'
import { TripExpenses, type DayOption } from './TripExpenses'
import { readCache, writeCache } from '../lib/resourceCache'
import { cacheKeys } from '../lib/cacheKeys'
import { shortDate } from '../lib/format'
import { useTripShell } from './useTripShell'

// TripBudgetPage renders the trip-level budget editor, rollup display, and the
// ad-hoc expense logger.
export function TripBudgetPage() {
  const { tripId } = useParams<{ tripId: string }>()
  const { trip } = useTripShell()
  const tripDates = datesInRange(trip.start_date, trip.end_date)
  const [rollup, setRollup] = useState<BudgetRollup | null>(null)
  const [lines, setLines] = useState<BudgetLine[]>([])
  const [entries, setEntries] = useState<CostEntry[]>([])
  const [dayOptions, setDayOptions] = useState<DayOption[]>([])
  const [error, setError] = useState<string | null>(null)
  // Mirror the latest rollup into a ref so loadRollup's error handler can tell
  // "nothing cached/loaded yet" (surface an error) from "already showing data"
  // (keep it — non-destructive refresh) without depending on stale state.
  const rollupRef = useRef<BudgetRollup | null>(rollup)
  useEffect(() => {
    rollupRef.current = rollup
  })

  const loadRollup = useCallback(
    (signal?: AbortSignal) => {
      if (!tripId) return
      fetchBudgetRollup(tripId, signal)
        .then((r) => {
          setRollup(r)
          void writeCache(cacheKeys.budgetRollup(tripId), r)
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') return
          if (err instanceof UnauthorizedError) return
          // Non-destructive: only surface an error when nothing was cached.
          if (!rollupRef.current) setError('Could not load budget data.')
        })
    },
    [tripId],
  )

  useEffect(() => {
    if (!tripId) return
    const controller = new AbortController()
    let done = false
    // Instant-render: seed the roll-up from cache (shared key with the day-view
    // budget), then revalidate. Sequenced so a slow fresh response isn't
    // clobbered by a late cached value.
    void readCache<BudgetRollup>(cacheKeys.budgetRollup(tripId)).then((cached) => {
      if (done) return
      if (cached) setRollup(cached.data)
      loadRollup(controller.signal)
    })
    // Expenses list (cache-then-revalidate, non-destructive on failure).
    void readCache<CostEntry[]>(cacheKeys.costEntries(tripId)).then((cached) => {
      if (done) return
      if (cached) setEntries(cached.data)
      listCostEntries(tripId, controller.signal)
        .then((es) => {
          if (done) return
          setEntries(es)
          void writeCache(cacheKeys.costEntries(tripId), es)
        })
        .catch(() => {
          /* keep cached list on failure */
        })
    })
    return () => {
      done = true
      controller.abort()
    }
  }, [tripId, loadRollup])

  // Build the day picker from the trip's days (id + date). Reads each day from
  // the shared per-day cache first for an instant list, then revalidates. Days
  // are only needed to pin an expense and to label day-linked ones.
  useEffect(() => {
    if (!tripId) return
    const controller = new AbortController()
    let done = false
    const dates = datesInRange(trip.start_date, trip.end_date)
    void Promise.all(
      dates.map((d) => readCache<{ id: string; date: string }>(cacheKeys.day(tripId, d))),
    ).then((cached) => {
      if (done) return
      const fromCache = cached
        .map((c) => c?.data)
        .filter((d): d is { id: string; date: string } => d != null)
      if (fromCache.length === dates.length) {
        setDayOptions(fromCache.map((d) => ({ id: d.id, date: d.date, label: shortDate(d.date) })))
      }
      Promise.all(dates.map((d) => fetchDay(tripId, d, controller.signal)))
        .then((loaded) => {
          if (done) return
          setDayOptions(loaded.map((d) => ({ id: d.id, date: d.date, label: shortDate(d.date) })))
        })
        .catch(() => {
          /* keep whatever we have; the picker just offers fewer/no days */
        })
    })
    return () => {
      done = true
      controller.abort()
    }
  }, [tripId, trip.start_date, trip.end_date])

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

  // persistEntries writes the entries list to cache so a reopen renders instantly.
  const persistEntries = useCallback(
    (next: CostEntry[]) => {
      if (tripId) void writeCache(cacheKeys.costEntries(tripId), next)
    },
    [tripId],
  )

  function handleEntryAdded(entry: CostEntry) {
    setEntries((prev) => {
      const next = [...prev, entry]
      persistEntries(next)
      return next
    })
    loadRollup()
  }

  function handleEntryUpdated(entry: CostEntry) {
    setEntries((prev) => {
      const next = prev.map((e) => (e.id === entry.id ? entry : e))
      persistEntries(next)
      return next
    })
    loadRollup()
  }

  function handleEntryDeleted(id: string) {
    setEntries((prev) => {
      const next = prev.filter((e) => e.id !== id)
      persistEntries(next)
      return next
    })
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

        {rollup && <BudgetSummaryTiles rollup={rollup} dayCount={tripDates.length} />}

        {rollup && <TripRollup rollup={rollup} dayCount={tripDates.length} />}

        <TripExpenses
          tripId={tripId}
          entries={entries}
          dayOptions={dayOptions}
          onAdded={handleEntryAdded}
          onUpdated={handleEntryUpdated}
          onDeleted={handleEntryDeleted}
        />

        <TripDayExtra
          tripId={tripId}
          rollup={rollup}
          dayOptions={dayOptions}
          onChanged={loadRollup}
        />

        <TripBudgetEditor
          tripId={tripId}
          lines={lines}
          rollup={rollup}
          dayCount={tripDates.length}
          onUpdated={handleLineUpdated}
        />
      </div>
    </article>
  )
}
