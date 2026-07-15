import { useEffect, useRef, useState } from 'react'
import {
  BUDGET_CATEGORIES,
  setDayBudgetLine,
  setTripBudgetLine,
  type BudgetCategory,
  type BudgetLine,
  type BudgetRollup,
  type BudgetScope,
  type SetBudgetLineInput,
} from '../lib/api'
import { enqueue } from '../lib/mutationQueue'
import { useIsOnline } from '../lib/useIsOnline'
import { tripBudgetForCategory, tripBudgetTotal } from './budgetModel'

// formatEUR formats a number as a compact EUR string, e.g. "€12.50".
function formatEUR(amount: number): string {
  return `€${amount.toFixed(2)}`
}

// CategoryBudgetRow is a single editable row for one category.
function CategoryBudgetRow({
  category,
  line,
  onSave,
}: {
  category: BudgetCategory
  line: BudgetLine | undefined
  onSave: (category: BudgetCategory, amount: number) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [inputVal, setInputVal] = useState('')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'queued' | 'error'>('idle')
  const inputRef = useRef<HTMLInputElement>(null)
  const committingRef = useRef(false)

  function startEdit() {
    setInputVal(line?.planned_amount != null ? String(line.planned_amount) : '')
    setEditing(true)
    setSaveStatus('idle')
  }

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  async function commit() {
    if (committingRef.current) return
    committingRef.current = true
    const val = parseFloat(inputVal)
    if (isNaN(val) || val < 0) {
      setSaveStatus('error')
      committingRef.current = false
      return
    }
    setSaveStatus('saving')
    try {
      await onSave(category, val)
      setEditing(false)
      setSaveStatus('idle')
    } catch (err) {
      // onSave signals offline by throwing with message 'queued'
      if (err instanceof Error && err.message === 'queued') {
        setEditing(false)
        setSaveStatus('queued')
      } else {
        setSaveStatus('error')
      }
    } finally {
      committingRef.current = false
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') commit()
    if (e.key === 'Escape') setEditing(false)
  }

  const planned = line?.planned_amount ?? 0
  const actual = line?.actual_amount ?? 0

  return (
    <li className="budget-editor-row">
      <span className="budget-editor-category">{category}</span>
      {editing ? (
        <span className="budget-editor-input-wrap">
          <span className="budget-editor-currency-prefix">€</span>
          <input
            ref={inputRef}
            className="budget-editor-input"
            type="number"
            min="0"
            step="0.01"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={commit}
            aria-label={`Planned amount for ${category}`}
            disabled={saveStatus === 'saving'}
          />
          {saveStatus === 'error' && (
            <span className="budget-editor-error">Enter a valid non-negative amount</span>
          )}
        </span>
      ) : (
        <button
          type="button"
          className="budget-editor-planned"
          onClick={startEdit}
          aria-label={`Set budget for ${category}, currently ${formatEUR(planned)}`}
        >
          {planned > 0 ? (
            formatEUR(planned)
          ) : (
            <span className="budget-editor-unset">Set budget</span>
          )}
        </button>
      )}
      <span className="budget-editor-actual" aria-label={`Actual spend for ${category}`}>
        {saveStatus === 'saving' && <span className="budget-save-status">Saving…</span>}
        {saveStatus === 'queued' && (
          <span className="budget-save-status budget-save-queued">Queued</span>
        )}
        {actual > 0 && saveStatus !== 'saving' && saveStatus !== 'queued'
          ? formatEUR(actual)
          : saveStatus === 'idle'
            ? '—'
            : null}
      </span>
    </li>
  )
}

// EditableAmount is an inline-editable euro cell: it shows the amount (or a
// placeholder) and swaps to a number input on click, saving on blur/Enter.
function EditableAmount({
  value,
  onSave,
  ariaLabel,
  placeholder = 'Set',
}: {
  value: number
  onSave: (amount: number) => Promise<void>
  ariaLabel: string
  placeholder?: string
}) {
  const [editing, setEditing] = useState(false)
  const [inputVal, setInputVal] = useState('')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'queued' | 'error'>('idle')
  const inputRef = useRef<HTMLInputElement>(null)
  const committingRef = useRef(false)

  function startEdit() {
    setInputVal(value > 0 ? String(value) : '')
    setEditing(true)
    setSaveStatus('idle')
  }

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  async function commit() {
    if (committingRef.current) return
    committingRef.current = true
    const val = parseFloat(inputVal)
    if (isNaN(val) || val < 0) {
      setSaveStatus('error')
      committingRef.current = false
      return
    }
    setSaveStatus('saving')
    try {
      await onSave(val)
      setEditing(false)
      setSaveStatus('idle')
    } catch (err) {
      if (err instanceof Error && err.message === 'queued') {
        setEditing(false)
        setSaveStatus('queued')
      } else {
        setSaveStatus('error')
      }
    } finally {
      committingRef.current = false
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') commit()
    if (e.key === 'Escape') setEditing(false)
  }

  if (editing) {
    return (
      <span className="budget-editor-input-wrap">
        <span className="budget-editor-currency-prefix">€</span>
        <input
          ref={inputRef}
          className="budget-editor-input"
          type="number"
          min="0"
          step="0.01"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={commit}
          aria-label={ariaLabel}
          disabled={saveStatus === 'saving'}
        />
        {saveStatus === 'error' && (
          <span className="budget-editor-error">Enter a valid non-negative amount</span>
        )}
      </span>
    )
  }
  return (
    <button
      type="button"
      className="budget-editor-planned"
      onClick={startEdit}
      aria-label={`${ariaLabel}, currently ${value > 0 ? formatEUR(value) : 'unset'}`}
    >
      {value > 0 ? formatEUR(value) : <span className="budget-editor-unset">{placeholder}</span>}
      {saveStatus === 'saving' && <span className="budget-save-status"> saving…</span>}
      {saveStatus === 'queued' && (
        <span className="budget-save-status budget-save-queued"> queued</span>
      )}
    </button>
  )
}

// TripBudgetEditor sets the trip's budget per category two ways that compose: a
// Per-day allowance (applies to every day) and a Whole-trip lump. The Budget
// column is the composed total (lump + allowance×days + any day extras); Spent
// is the actual so far. Day extras are set on the day itself.
export function TripBudgetEditor({
  tripId,
  lines,
  rollup,
  dayCount,
  onUpdated,
}: {
  tripId: string
  lines: BudgetLine[]
  rollup: BudgetRollup | null
  dayCount: number
  onUpdated: (line: BudgetLine) => void
}) {
  const isOnline = useIsOnline()
  // Trip-level lines only (day extras are set on the day), keyed by category+scope.
  const lineByKey = Object.fromEntries(
    lines.filter((l) => !l.day_id).map((l) => [`${l.category}:${l.scope ?? 'trip'}`, l]),
  )

  async function handleSave(category: BudgetCategory, scope: BudgetScope, amount: number) {
    const input: SetBudgetLineInput = { category, scope, planned_amount: amount }
    if (!isOnline) {
      await enqueue('setTripBudgetLine', { tripId, input })
      const existing = lineByKey[`${category}:${scope}`]
      onUpdated({
        id: existing?.id ?? '',
        trip_id: tripId,
        day_id: null,
        category,
        scope,
        planned_amount: amount,
        actual_amount: existing?.actual_amount ?? 0,
      })
      throw new Error('queued')
    }
    const saved = await setTripBudgetLine(tripId, input)
    onUpdated(saved)
  }

  return (
    <div className="budget-editor">
      <h3 className="budget-editor-heading">Trip budget</h3>
      <div className="budget-setup-scroll">
        <table className="budget-setup">
          <thead>
            <tr>
              <th>Category</th>
              <th className="r">Per day</th>
              <th className="r">Whole trip</th>
              <th className="r">Budget</th>
              <th className="r">Spent</th>
            </tr>
          </thead>
          <tbody>
            {BUDGET_CATEGORIES.map((cat) => {
              const daily = lineByKey[`${cat}:daily`]?.planned_amount ?? 0
              const lump = lineByKey[`${cat}:trip`]?.planned_amount ?? 0
              const budget = rollup
                ? tripBudgetForCategory(rollup, dayCount, cat)
                : lump + daily * dayCount
              const spent = rollup?.by_category?.[cat] ?? 0
              return (
                <tr key={cat}>
                  <td>{cat}</td>
                  <td className="r">
                    <EditableAmount
                      value={daily}
                      onSave={(a) => handleSave(cat, 'daily', a)}
                      ariaLabel={`Per-day allowance for ${cat}`}
                      placeholder="/day"
                    />
                  </td>
                  <td className="r">
                    <EditableAmount
                      value={lump}
                      onSave={(a) => handleSave(cat, 'trip', a)}
                      ariaLabel={`Whole-trip budget for ${cat}`}
                    />
                  </td>
                  <td className="r budget-setup-total num">{formatEUR(budget)}</td>
                  <td className="r num">{spent > 0 ? formatEUR(spent) : '—'}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <td>Trip budget</td>
              <td></td>
              <td></td>
              <td className="r budget-setup-total num">
                {formatEUR(rollup ? tripBudgetTotal(rollup, dayCount) : 0)}
              </td>
              <td className="r num">
                {rollup && rollup.trip_total > 0 ? formatEUR(rollup.trip_total) : '—'}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="budget-editor-hint">
        Per-day applies to every day (× {dayCount}). Whole trip is a one-off pool. Set a day’s extra
        on that day. All amounts in EUR.
      </p>
    </div>
  )
}

// DayBudgetEditor renders the per-day budget editor.
export function DayBudgetEditor({
  tripId,
  dayId,
  lines,
  onUpdated,
}: {
  tripId: string
  dayId: string
  lines: BudgetLine[]
  onUpdated: (line: BudgetLine) => void
}) {
  const isOnline = useIsOnline()
  const lineByCategory = Object.fromEntries(lines.map((l) => [l.category, l]))

  async function handleSave(category: BudgetCategory, amount: number) {
    const input: SetBudgetLineInput = { category, planned_amount: amount }
    if (!isOnline) {
      await enqueue('setDayBudgetLine', { tripId, dayId, input })
      const existing = lineByCategory[category]
      onUpdated({
        id: existing?.id ?? '',
        trip_id: tripId,
        day_id: dayId,
        category,
        planned_amount: amount,
        actual_amount: existing?.actual_amount ?? 0,
      })
      throw new Error('queued')
    }
    const saved = await setDayBudgetLine(tripId, dayId, input)
    onUpdated(saved)
  }

  return (
    <div className="budget-editor budget-editor--day">
      <h3 className="budget-editor-heading">Day budget</h3>
      <div className="budget-editor-header-row">
        <span className="budget-editor-col-label">Category</span>
        <span className="budget-editor-col-label">Planned</span>
        <span className="budget-editor-col-label">Spent</span>
      </div>
      <ul className="budget-editor-list">
        {BUDGET_CATEGORIES.map((cat) => (
          <CategoryBudgetRow
            key={cat}
            category={cat}
            line={lineByCategory[cat]}
            onSave={handleSave}
          />
        ))}
      </ul>
      <p className="budget-editor-hint">Click a planned amount to edit. All amounts in EUR.</p>
    </div>
  )
}
