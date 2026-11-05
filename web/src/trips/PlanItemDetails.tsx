import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { PlanItemValidationError, type PlanItem } from '../lib/api'
import { useFocusTrap } from '../components/ui/useFocusTrap'
import { Icon } from '../components/ui/Icon'
import { PackagePicker } from './PackagePicker'
import { PlanItemForm } from './PlanItemForm'
import { PLAN_STATUSES, usePlanItemActions } from './planItemActions'
import { BookingSelect } from './BookingChip'
import { bookingOfItem, itemCounts, itemCountsAsSpent } from './booking'
import { packageForItem, usePackages } from './packages'
import { euroWhole } from '../lib/format'
import { fieldsFromItem, type PlanItemFormFields } from './planItemForm.helpers'

// dayOptionLabel: "Thu 19 Nov · Day 2".
function dayOptionLabel(date: string, i: number): string {
  const d = new Date(date + 'T00:00:00')
  return `${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} · Day ${i + 1}`
}

// PlanItemDetails is the Plan details sheet: a bottom sheet on phones and a
// side panel on desktop. It hosts every PlanItemForm field (auto-saved as you
// type), a status segmented control, and Move to another day / Move to the
// backlog / Delete (confirmed in place — no window.confirm).
export function PlanItemDetails({
  item,
  tripId,
  dayLabel,
  tripDates,
  currentDate,
  onClose,
  onUpdated,
  onRemoved,
  onAdded,
  onItemMoved,
}: {
  item: PlanItem
  tripId: string
  dayLabel: string
  tripDates: string[]
  currentDate: string
  onClose: () => void
  onUpdated: (item: PlanItem) => void
  onRemoved: (id: string) => void
  onAdded?: (item: PlanItem) => void
  onItemMoved?: (targetDate: string, item: PlanItem) => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(true, panelRef)
  const actions = usePlanItemActions({ tripId, onUpdated, onRemoved, onAdded })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<'idle' | 'move' | 'delete'>('idle')
  const otherDates = tripDates.filter((d) => d !== currentDate)
  const [target, setTarget] = useState(otherDates[0] ?? '')

  // Escape closes; body scroll locks while open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  async function run(fn: () => Promise<unknown>, failMsg: string, closeAfter = false) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      if (closeAfter) onClose()
    } catch (err) {
      setError(err instanceof Error && err.message.includes('cached') ? err.message : failMsg)
    } finally {
      setBusy(false)
    }
  }

  // The form doesn't show Booking here (it sits above it), so its saves carry
  // the item's current status rather than the value it was opened with.
  const withBooking = (fields: PlanItemFormFields): PlanItemFormFields => ({
    ...fields,
    booking_status: bookingOfItem(item),
  })
  const includedIn = packageForItem(usePackages(item.trip_id), item.id)
  const isNote = (item.kind ?? 'activity') === 'note'
  const statusValue = ['done', 'skipped', 'cancelled'].includes(item.status)
    ? item.status
    : 'planned'

  async function handleSubmit(fields: PlanItemFormFields, splitParts: number) {
    setError(null)
    try {
      await actions.save(item, withBooking(fields), splitParts)
      onClose()
    } catch (err) {
      setError(err instanceof PlanItemValidationError ? err.message : 'Could not save changes.')
    }
  }

  return createPortal(
    <div
      className="details-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        className="details-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Plan details"
      >
        <div className="details-head">
          <span className="details-handle" aria-hidden="true" />
          <div className="details-head-row">
            <button type="button" className="details-head-btn" onClick={onClose}>
              Close
            </button>
            <span className="fg-meta">{dayLabel}</span>
            <span className="details-head-spacer" aria-hidden="true" />
          </div>
        </div>

        <div className="details-body">
          <div className="details-section details-status">
            {!isNote && !includedIn && (
              <label className="details-status-field">
                <span className="details-field-label">Booking</span>
                <BookingSelect
                  value={bookingOfItem(item)}
                  disabled={busy}
                  onChange={(b) =>
                    void run(() => actions.setBooking(item, b), 'Could not change the booking.')
                  }
                />
              </label>
            )}
            <label className="details-status-field">
              <span className="details-field-label">Happened?</span>
              <select
                className="form-input bk-select"
                value={statusValue}
                disabled={busy}
                onChange={(e) =>
                  void run(
                    () => actions.setStatus(item, e.target.value),
                    'Could not change the status.',
                  )
                }
              >
                {PLAN_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            {!isNote && !includedIn && item.cost != null && item.cost > 0 && (
              <p className="details-status-hint">
                {!itemCounts(item) ? (
                  <>{euroWhole(item.cost)} isn’t counted: it didn’t happen and wasn’t paid.</>
                ) : itemCountsAsSpent(item) ? (
                  <>
                    {euroWhole(item.cost)} counts as <b>spent</b>.
                  </>
                ) : (
                  <>
                    {euroWhole(item.cost)} counts as <b>booked</b>. Mark it paid or done and it
                    moves to spent.
                  </>
                )}
              </p>
            )}
          </div>

          <PackagePicker item={item} date={currentDate} />

          <PlanItemForm
            key={item.id}
            initialFields={fieldsFromItem(item)}
            submitLabel="Save"
            onSubmit={handleSubmit}
            onAutoSave={(fields) => actions.save(item, withBooking(fields))}
            error={null}
            actionsPlacement="footer"
            hideBooking
          />

          {error && (
            <p role="alert" className="fg-error details-error">
              {error}
            </p>
          )}

          <div className="details-actions">
            {mode === 'move' ? (
              <div className="details-move">
                <label className="details-field-label" htmlFor={`move-${item.id}`}>
                  Move to
                </label>
                {otherDates.length === 0 ? (
                  <p className="fg-muted">No other days in this trip.</p>
                ) : (
                  <select
                    id={`move-${item.id}`}
                    className="details-select"
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    disabled={busy}
                  >
                    {tripDates.map((d, i) =>
                      d === currentDate ? null : (
                        <option key={d} value={d}>
                          {dayOptionLabel(d, i)}
                        </option>
                      ),
                    )}
                  </select>
                )}
                <div className="details-inline-actions">
                  <button
                    type="button"
                    className="fg-btn fg-btn--primary"
                    disabled={busy || !target}
                    onClick={() =>
                      void run(
                        async () => {
                          const moved = await actions.moveToDay(item, target)
                          onItemMoved?.(target, moved)
                        },
                        'Could not move item.',
                        true,
                      )
                    }
                  >
                    Move
                  </button>
                  <button
                    type="button"
                    className="fg-btn fg-btn--quiet"
                    onClick={() => setMode('idle')}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : mode === 'delete' ? (
              <div className="details-confirm" role="group" aria-label="Confirm delete">
                <p>Delete “{item.title}”? This can’t be undone.</p>
                <div className="details-inline-actions">
                  <button
                    type="button"
                    className="fg-btn fg-btn--danger"
                    disabled={busy}
                    onClick={() =>
                      void run(() => actions.remove(item), 'Could not delete item.', true)
                    }
                    aria-label={`Confirm delete ${item.title}`}
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    className="fg-btn fg-btn--quiet"
                    onClick={() => setMode('idle')}
                  >
                    Keep it
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button type="button" className="details-action" onClick={() => setMode('move')}>
                  Move to another day
                </button>
                <button
                  type="button"
                  className="details-action"
                  disabled={busy}
                  onClick={() =>
                    void run(() => actions.demote(item), 'Could not move to the backlog.', true)
                  }
                >
                  Move to the backlog
                </button>
                <button
                  type="button"
                  className="details-action details-action--danger"
                  onClick={() => setMode('delete')}
                >
                  <Icon name="trash" size={16} /> Delete
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
