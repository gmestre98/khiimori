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
import { BUDGET_CATEGORIES } from '../lib/api'
import { euroWhole } from '../lib/format'
import { tripBudgetForCategory, tripBudgetTotal } from './budgetModel'
import { TripExpenses, type DayOption } from './TripExpenses'
import { readCache, writeCache } from '../lib/resourceCache'
import { cacheKeys } from '../lib/cacheKeys'
import { shortDate } from '../lib/format'
import { useIsOnline } from '../lib/useIsOnline'
import { patchRollupPlanned } from './budgetModel'

// MoneySummary leads the Money tab: Booked (everything committed — spent plus
// planned costs not yet done/paid), Spent, and Budget. When the plan already
// costs more than the budget, a warning says so.
function MoneySummary({ rollup, dayCount }: { rollup: BudgetRollup; dayCount: number }) {
  const spent = rollup.trip_total
  const booked = spent + (rollup.estimated_trip_total ?? 0)
  const budget = tripBudgetTotal(rollup, dayCount)
  const over = budget > 0 && booked > budget
  const unbudgeted = BUDGET_CATEGORIES.filter(
    (c) =>
      tripBudgetForCategory(rollup, dayCount, c) === 0 &&
      (rollup.by_category[c] ?? 0) + (rollup.estimated_by_category?.[c] ?? 0) > 0,
  )
  return (
    <>
      <div className="fg-stats money-stats" aria-label="Money summary">
        <div className="fg-stat">
          <span className="fg-stat-label">Booked</span>
          <span className="fg-stat-value money-figure">{euroWhole(booked)}</span>
        </div>
        <div className="fg-stat">
          <span className="fg-stat-label">Spent</span>
          <span className="fg-stat-value money-figure">{euroWhole(spent)}</span>
        </div>
        <div className={over ? 'fg-stat fg-stat--warn' : 'fg-stat'}>
          <span className="fg-stat-label">Budget</span>
          <span className="fg-stat-value money-figure">{budget > 0 ? euroWhole(budget) : '—'}</span>
        </div>
      </div>
      {over && (
        <div className="fg-callout" role="status">
          <span>
            <strong>Your budget is below what’s already booked.</strong> {euroWhole(booked)} is
            booked against a {euroWhole(budget)} budget
            {unbudgeted.length > 0
              ? `, and ${unbudgeted.map((c) => c.toLowerCase()).join(', ')} ${unbudgeted.length === 1 ? 'has' : 'have'} no budget at all`
              : ''}
            .
          </span>
          <a href="#budget-setup" className="fg-btn fg-btn--danger money-callout-btn">
            Adjust the budget
          </a>
        </div>
      )}
      {budget === 0 && booked > 0 && (
        <div className="fg-callout fg-callout--info" role="status">
          <span>
            No budget yet. Set a daily allowance per category so these totals mean something.
          </span>
          <a href="#budget-setup" className="fg-btn fg-btn--quiet money-callout-btn">
            Set a daily budget
          </a>
        </div>
      )}
    </>
  )
}

// MoneyCategories shows each category as a row with a bar: booked vs budget,
// the bar and figure turning to the warning colour when over.
function MoneyCategories({ rollup, dayCount }: { rollup: BudgetRollup; dayCount: number }) {
  const rows = BUDGET_CATEGORIES.map((cat) => {
    const booked = (rollup.by_category[cat] ?? 0) + (rollup.estimated_by_category?.[cat] ?? 0)
    const spent = rollup.by_category[cat] ?? 0
    const budget = tripBudgetForCategory(rollup, dayCount, cat)
    return { cat, booked, spent, budget }
  })
  if (rows.every((r) => r.booked === 0 && r.budget === 0)) {
    return <p className="fg-empty">No costs recorded yet.</p>
  }
  return (
    <section className="money-cats" aria-label="By category">
      <h2 className="fg-label fg-section-label">By category · booked vs budget</h2>
      <ul className="money-cat-list">
        {rows.map(({ cat, booked, spent, budget }) => {
          const over = booked > budget && booked > 0
          const pct = budget > 0 ? Math.min(100, (booked / budget) * 100) : booked > 0 ? 100 : 0
          return (
            <li key={cat} className="money-cat">
              <div className="money-cat-head">
                <span className="money-cat-name">{cat}</span>
                <span className={over ? 'money-cat-fig money-cat-fig--over' : 'money-cat-fig'}>
                  {euroWhole(booked)} / {budget > 0 ? euroWhole(budget) : 'no budget'}
                </span>
              </div>
              <div
                className={over ? 'fg-bar fg-bar--over' : 'fg-bar'}
                role="progressbar"
                aria-label={`${cat}: ${euroWhole(booked)} booked of ${budget > 0 ? euroWhole(budget) : 'no budget'}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(pct)}
              >
                <span style={{ width: `${pct}%` }} />
              </div>
              {spent > 0 && spent !== booked && (
                <span className="money-cat-spent">{euroWhole(spent)} spent so far</span>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
import { useTripShell } from './useTripShell'

// TripBudgetPage renders the trip-level budget editor, rollup display, and the
// ad-hoc expense logger.
export function TripBudgetPage() {
  const { tripId } = useParams<{ tripId: string }>()
  const { trip } = useTripShell()
  const online = useIsOnline()
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

  // applyOfflineLine reflects a budget line saved offline into the rollup (and its
  // cache) without a server round-trip, so the composed budget updates in-session
  // and survives an offline reload. The authoritative rollup replaces it when the
  // queued write syncs on reconnect. See patchRollupPlanned.
  const applyOfflineLine = useCallback(
    (line: BudgetLine) => {
      setRollup((cur) => {
        const patched = patchRollupPlanned(cur, line)
        if (patched && tripId) void writeCache(cacheKeys.budgetRollup(tripId), patched)
        return patched
      })
    },
    [tripId],
  )

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
    if (!online) {
      applyOfflineLine(line)
      return
    }
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
    <article className="fg-screen money-page trip-budget-page" aria-labelledby="money-title">
      <h1 id="money-title" className="fg-page-title trip-budget-title">
        Money
      </h1>
      {error && (
        <p role="alert" className="fg-error trip-budget-error">
          {error}
        </p>
      )}

      {rollup && <MoneySummary rollup={rollup} dayCount={tripDates.length} />}
      {rollup && <MoneyCategories rollup={rollup} dayCount={tripDates.length} />}

      <TripExpenses
        tripId={tripId}
        entries={entries}
        dayOptions={dayOptions}
        onAdded={handleEntryAdded}
        onUpdated={handleEntryUpdated}
        onDeleted={handleEntryDeleted}
      />

      <div id="budget-setup" className="money-setup">
        <TripBudgetEditor
          tripId={tripId}
          lines={lines}
          rollup={rollup}
          dayCount={tripDates.length}
          onUpdated={handleLineUpdated}
        />

        <TripDayExtra
          tripId={tripId}
          rollup={rollup}
          dayOptions={dayOptions}
          onChanged={(line) => (line ? applyOfflineLine(line) : loadRollup())}
        />
      </div>
    </article>
  )
}
