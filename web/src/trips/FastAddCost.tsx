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

// formatEUR formats a number as a compact EUR string, e.g. "€12.50".
function formatEUR(amount: number): string {
  return `€${amount.toFixed(2)}`
}

// CostEntryItem renders a single cost entry with inline edit / delete controls.
function CostEntryItem({
  entry,
  onUpdated,
  onDeleted,
  isOnline,
}: {
  entry: CostEntry
  onUpdated: (e: CostEntry) => void
  onDeleted: (id: string) => void
  isOnline: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [category, setCategory] = useState<BudgetCategory>(entry.category)
  const [amount, setAmount] = useState(String(entry.amount))
  const [note, setNote] = useState(entry.note)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'queued'>('idle')
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
        // Optimistic update
        onUpdated({ ...entry, category, amount: val, note: note.trim() })
        setEditing(false)
        setSaveStatus('queued')
      } else {
        const updated = await updateCostEntry(entry.trip_id, entry.id, input)
        onUpdated(updated)
        setEditing(false)
      }
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
        onDeleted(entry.id)
      } else {
        await deleteCostEntry(entry.trip_id, entry.id)
        onDeleted(entry.id)
      }
    } catch {
      setError('Delete failed — try again')
    }
  }

  if (editing) {
    return (
      <li className="cost-entry cost-entry--editing">
        <select
          className="cost-entry-category-select"
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
        <span className="cost-entry-currency">€</span>
        <input
          className="cost-entry-amount-input"
          type="number"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          aria-label="Amount"
          disabled={saving}
        />
        <input
          className="cost-entry-note-input"
          type="text"
          placeholder="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          aria-label="Note"
          disabled={saving}
        />
        {error && <span className="cost-entry-error">{error}</span>}
        <div className="cost-entry-edit-actions">
          <button
            type="button"
            className="cost-entry-save-btn"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            className="cost-entry-cancel-btn"
            onClick={() => setEditing(false)}
            disabled={saving}
          >
            Cancel
          </button>
        </div>
      </li>
    )
  }

  return (
    <li className="cost-entry">
      <span className="cost-entry-category">{entry.category}</span>
      <span className="cost-entry-amount">{formatEUR(entry.amount)}</span>
      {entry.note && <span className="cost-entry-note">{entry.note}</span>}
      {saveStatus === 'queued' && (
        <span className="cost-entry-queued" aria-label="Queued for sync">
          Queued
        </span>
      )}
      <div className="cost-entry-actions">
        <button
          type="button"
          className="cost-entry-edit-btn"
          onClick={() => setEditing(true)}
          aria-label={`Edit ${entry.category} cost`}
        >
          Edit
        </button>
        <button
          type="button"
          className="cost-entry-delete-btn"
          onClick={handleDelete}
          aria-label={`Delete ${entry.category} cost`}
        >
          ✕
        </button>
      </div>
      {error && <span className="cost-entry-error">{error}</span>}
    </li>
  )
}

// AddCostForm is the quick-add form for logging a new cost entry.
function AddCostForm({
  tripId,
  dayId,
  defaultCategory,
  isOnline,
  onAdded,
}: {
  tripId: string
  dayId: string
  defaultCategory: BudgetCategory
  isOnline: boolean
  onAdded: (e: CostEntry) => void
}) {
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState<BudgetCategory>(defaultCategory)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const amountRef = useRef<HTMLInputElement>(null)

  function handleOpen() {
    setCategory(defaultCategory)
    setAmount('')
    setNote('')
    setError(null)
    setOpen(true)
    // Focus the amount field after open (next tick so DOM is ready)
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
      day_id: dayId,
      category,
      amount: val,
      note: note.trim() || undefined,
    }
    try {
      if (!isOnline) {
        await enqueue('createCostEntry', { tripId, input })
        // Synthesise a temporary entry so the UI shows it immediately.
        const tempEntry: CostEntry = {
          id: crypto.randomUUID(),
          trip_id: tripId,
          day_id: dayId,
          plan_item_id: '',
          category,
          amount: val,
          note: note.trim(),
          created_at: new Date().toISOString(),
        }
        onAdded(tempEntry)
        setAmount('')
        setNote('')
        setOpen(false)
        setSaveStatus('queued')
      } else {
        const entry = await createCostEntry(tripId, input)
        onAdded(entry)
        setAmount('')
        setNote('')
        setOpen(false)
      }
    } catch {
      setError('Failed to log cost — try again')
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) {
    return (
      <button type="button" className="fast-add-cost-btn" onClick={handleOpen}>
        + Log cost
      </button>
    )
  }

  return (
    <form className="fast-add-cost-form" onSubmit={handleSubmit} aria-label="Log a cost">
      <div className="fast-add-cost-row">
        <select
          className="fast-add-cost-category"
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
        <span className="fast-add-cost-currency">€</span>
        <input
          ref={amountRef}
          className="fast-add-cost-amount"
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
        className="fast-add-cost-note"
        type="text"
        placeholder="Note (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        aria-label="Note"
        disabled={submitting}
      />
      {error && <span className="fast-add-cost-error">{error}</span>}
      <div className="fast-add-cost-actions">
        <button
          type="submit"
          className="fast-add-cost-submit"
          disabled={submitting || amount === '' || isNaN(parseFloat(amount))}
        >
          {submitting ? 'Saving…' : 'Log'}
        </button>
        <button
          type="button"
          className="fast-add-cost-cancel"
          onClick={() => setOpen(false)}
          disabled={submitting}
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

// FastAddCost renders the cost entry list and quick-add form for a day.
export function FastAddCost({
  tripId,
  dayId,
  entries,
  onAdded,
  onUpdated,
  onDeleted,
}: {
  tripId: string
  dayId: string
  entries: CostEntry[]
  onAdded: (e: CostEntry) => void
  onUpdated: (e: CostEntry) => void
  onDeleted: (id: string) => void
}) {
  const isOnline = useIsOnline()
  const total = entries.reduce((sum, e) => sum + e.amount, 0)

  return (
    <div className="fast-add-cost">
      {!isOnline && (
        <p className="fast-add-cost-offline">Offline — changes will sync when reconnected.</p>
      )}
      {entries.length > 0 && (
        <>
          <ul className="cost-entry-list" aria-label="Cost entries">
            {entries.map((e) => (
              <CostEntryItem
                key={e.id}
                entry={e}
                onUpdated={onUpdated}
                onDeleted={onDeleted}
                isOnline={isOnline}
              />
            ))}
          </ul>
          <div className="cost-entry-total">
            <span className="cost-entry-total-label">Day total:</span>
            <span className="cost-entry-total-value">{formatEUR(total)}</span>
          </div>
        </>
      )}
      <AddCostForm
        tripId={tripId}
        dayId={dayId}
        defaultCategory="Other"
        isOnline={isOnline}
        onAdded={onAdded}
      />
    </div>
  )
}
