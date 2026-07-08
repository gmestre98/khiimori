import { useRef, useState } from 'react'
import {
  BUDGET_CATEGORIES,
  createCostEntry,
  deleteCostEntry,
  updateCostEntry,
  type BudgetCategory,
  type CostEntry,
  type CreateCostEntryInput,
  type UpdateCostEntryInput,
} from '../lib/api'
import { enqueue } from '../lib/mutationQueue'
import { useIsOnline } from '../lib/useIsOnline'
import { euro } from '../lib/format'

// DayOption is a trip day the expense form can pin a cost to.
export interface DayOption {
  id: string
  date: string
  label: string
}

// ExpenseRow renders one logged expense with inline edit / delete. Only the
// category, amount, and note are editable; the day link is set at creation.
function ExpenseRow({
  entry,
  dayLabel,
  isOnline,
  onUpdated,
  onDeleted,
}: {
  entry: CostEntry
  dayLabel: string | null
  isOnline: boolean
  onUpdated: (e: CostEntry) => void
  onDeleted: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [category, setCategory] = useState<BudgetCategory>(entry.category)
  const [amount, setAmount] = useState(String(entry.amount))
  const [note, setNote] = useState(entry.note)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    const val = parseFloat(amount)
    if (isNaN(val) || val < 0) {
      setError('Enter a valid non-negative amount')
      return
    }
    setSaving(true)
    setError(null)
    const input: UpdateCostEntryInput = { category, amount: val, note: note.trim() || undefined }
    try {
      if (!isOnline) {
        await enqueue('updateCostEntry', { tripId: entry.trip_id, entryId: entry.id, input })
        onUpdated({ ...entry, category, amount: val, note: note.trim() })
      } else {
        onUpdated(await updateCostEntry(entry.trip_id, entry.id, input))
      }
      setEditing(false)
    } catch {
      setError('Save failed — try again')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    try {
      if (!isOnline) {
        await enqueue('deleteCostEntry', { tripId: entry.trip_id, entryId: entry.id })
      } else {
        await deleteCostEntry(entry.trip_id, entry.id)
      }
      onDeleted(entry.id)
    } catch {
      setError('Delete failed — try again')
    }
  }

  if (editing) {
    return (
      <li className="expense-row expense-row--editing">
        <select
          className="expense-category"
          value={category}
          onChange={(e) => setCategory(e.target.value as BudgetCategory)}
          aria-label="Category"
          disabled={saving}
        >
          {BUDGET_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          className="expense-amount-input"
          type="number"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          aria-label="Amount"
          disabled={saving}
        />
        <input
          className="expense-note-input"
          type="text"
          placeholder="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          aria-label="Note"
          disabled={saving}
        />
        {error && <span className="expense-error">{error}</span>}
        <div className="expense-row-actions">
          <button type="button" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" onClick={() => setEditing(false)} disabled={saving}>
            Cancel
          </button>
        </div>
      </li>
    )
  }

  return (
    <li className="expense-row">
      <span className="expense-category-label">{entry.category}</span>
      <span className="expense-amount num">{euro(entry.amount)}</span>
      {entry.note && <span className="expense-note">{entry.note}</span>}
      <span className="expense-day meta">{dayLabel ?? 'Whole trip'}</span>
      <div className="expense-row-actions">
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label={`Edit ${entry.category} expense`}
        >
          Edit
        </button>
        <button
          type="button"
          onClick={handleDelete}
          aria-label={`Delete ${entry.category} expense`}
        >
          ✕
        </button>
      </div>
      {error && <span className="expense-error">{error}</span>}
    </li>
  )
}

// TripExpenses is the Budget-tab logger for ad-hoc costs that aren't tied to any
// activity — street food, water, a souvenir. An expense attaches to the whole
// trip by default, or to a day the traveller picks. Manual expenses always count
// as spent (they are logged after paying), unlike a plan item's estimated cost.
export function TripExpenses({
  tripId,
  entries,
  dayOptions,
  onAdded,
  onUpdated,
  onDeleted,
}: {
  tripId: string
  entries: CostEntry[]
  dayOptions: DayOption[]
  onAdded: (e: CostEntry) => void
  onUpdated: (e: CostEntry) => void
  onDeleted: (id: string) => void
}) {
  const isOnline = useIsOnline()
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState<BudgetCategory>('Food')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [dayId, setDayId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const amountRef = useRef<HTMLInputElement>(null)

  const dayLabelFor = (id: string): string | null =>
    dayOptions.find((d) => d.id === id)?.label ?? null

  function openForm() {
    setCategory('Food')
    setAmount('')
    setNote('')
    setDayId('')
    setError(null)
    setOpen(true)
    setTimeout(() => amountRef.current?.focus(), 0)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const val = parseFloat(amount)
    if (isNaN(val) || val < 0) {
      setError('Enter a valid non-negative amount')
      return
    }
    setSubmitting(true)
    setError(null)
    const input: CreateCostEntryInput = {
      category,
      amount: val,
      note: note.trim() || undefined,
      day_id: dayId || undefined,
    }
    try {
      if (!isOnline) {
        await enqueue('createCostEntry', { tripId, input })
        onAdded({
          id: crypto.randomUUID(),
          trip_id: tripId,
          day_id: dayId,
          plan_item_id: '',
          category,
          amount: val,
          note: note.trim(),
          created_at: new Date().toISOString(),
        })
      } else {
        onAdded(await createCostEntry(tripId, input))
      }
      setOpen(false)
    } catch {
      setError('Failed to log expense — try again')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="card rollup-card trip-expenses" aria-label="Logged expenses">
      <div className="rollup-card-head row between">
        <span className="eyebrow">Expenses</span>
        {!open && (
          <button type="button" className="expense-add-btn" onClick={openForm}>
            + Log expense
          </button>
        )}
      </div>
      <div className="rollup-card-body">
        {!isOnline && <p className="meta">Offline — changes will sync when reconnected.</p>}

        {open && (
          <form className="expense-form" onSubmit={handleSubmit} aria-label="Log an expense">
            <div className="expense-form-row">
              <select
                className="expense-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as BudgetCategory)}
                aria-label="Category"
                disabled={submitting}
              >
                {BUDGET_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <input
                ref={amountRef}
                className="expense-amount-input"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                aria-label="Amount in EUR"
                disabled={submitting}
                required
              />
            </div>
            <input
              className="expense-note-input"
              type="text"
              placeholder="Note (e.g. street food, water, souvenir)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              aria-label="Note"
              disabled={submitting}
            />
            <select
              className="expense-day-select"
              value={dayId}
              onChange={(e) => setDayId(e.target.value)}
              aria-label="Day (optional)"
              disabled={submitting}
            >
              <option value="">Whole trip (no day)</option>
              {dayOptions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
            {error && <span className="expense-error">{error}</span>}
            <div className="expense-form-actions">
              <button
                type="submit"
                disabled={submitting || amount === '' || isNaN(parseFloat(amount))}
              >
                {submitting ? 'Saving…' : 'Log'}
              </button>
              <button type="button" onClick={() => setOpen(false)} disabled={submitting}>
                Cancel
              </button>
            </div>
          </form>
        )}

        {entries.length > 0 ? (
          <ul className="expense-list" aria-label="Expenses">
            {entries.map((e) => (
              <ExpenseRow
                key={e.id}
                entry={e}
                dayLabel={e.day_id ? dayLabelFor(e.day_id) : null}
                isOnline={isOnline}
                onUpdated={onUpdated}
                onDeleted={onDeleted}
              />
            ))}
          </ul>
        ) : (
          !open && <p className="meta">No expenses logged yet.</p>
        )}
      </div>
    </section>
  )
}
