import { useEffect, useRef, useState } from 'react'
import {
  BUDGET_CATEGORIES,
  setDayBudgetLine,
  setTripBudgetLine,
  type BudgetCategory,
  type BudgetLine,
} from '../lib/api'

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
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function startEdit() {
    setInputVal(line?.planned_amount != null ? String(line.planned_amount) : '')
    setEditing(true)
    setError(null)
  }

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  async function commit() {
    const val = parseFloat(inputVal)
    if (isNaN(val) || val < 0) {
      setError('Enter a valid non-negative amount')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave(category, val)
      setEditing(false)
    } catch {
      setError('Save failed — try again')
    } finally {
      setSaving(false)
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
            disabled={saving}
          />
          {error && <span className="budget-editor-error">{error}</span>}
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
        {actual > 0 ? formatEUR(actual) : '—'}
      </span>
    </li>
  )
}

// TripBudgetEditor renders the trip-level budget editor (no day scope).
export function TripBudgetEditor({
  tripId,
  lines,
  onUpdated,
}: {
  tripId: string
  lines: BudgetLine[]
  onUpdated: (line: BudgetLine) => void
}) {
  const lineByCategory = Object.fromEntries(lines.map((l) => [l.category, l]))

  async function handleSave(category: BudgetCategory, amount: number) {
    const saved = await setTripBudgetLine(tripId, { category, planned_amount: amount })
    onUpdated(saved)
  }

  return (
    <div className="budget-editor">
      <h3 className="budget-editor-heading">Trip budget</h3>
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
  const lineByCategory = Object.fromEntries(lines.map((l) => [l.category, l]))

  async function handleSave(category: BudgetCategory, amount: number) {
    const saved = await setDayBudgetLine(tripId, dayId, { category, planned_amount: amount })
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
