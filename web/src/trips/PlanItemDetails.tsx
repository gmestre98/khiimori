import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { PlanItemValidationError, type PlanItem } from '../lib/api'
import { useFocusTrap } from '../components/ui/useFocusTrap'
import { Icon } from '../components/ui/Icon'
import { PackagePicker } from './PackagePicker'
import { ItemSheetFields, type SheetSection } from './ItemSheetFields'
import { usePlanItemActions } from './planItemActions'
import { StatusOptions } from './StatusChip'
import { chipText, chipTone, happenedOf } from './statusModel'
import { bookingOfItem, itemCounts, itemCountsAsSpent } from './booking'
import { packageForItem, usePackages } from './packages'
import { euroWhole } from '../lib/format'
import { useVisibleViewport } from './useVisibleViewport'
import {
  AUTO_SAVE_DEBOUNCE_MS,
  fieldsFromItem,
  type PlanItemFormFields,
  type SaveStatus,
} from './planItemForm.helpers'

// dayOptionLabel: "Thu 19 Nov · Day 2".
function dayOptionLabel(date: string, i: number): string {
  const d = new Date(date + 'T00:00:00')
  return `${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} · Day ${i + 1}`
}

// PlanItemDetails is the Plan details sheet: a bottom sheet on phones and a
// side panel on desktop. It uses the same rows as the add sheet (design option
// A), auto-saved as you edit, with the full status list under its row, and
// Move to another day / Move to the backlog / Delete (confirmed in place).
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
  const box = useVisibleViewport(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<'idle' | 'move' | 'delete'>('idle')
  const [fields, setFields] = useState<PlanItemFormFields>(() => fieldsFromItem(item))
  const [open, setOpen] = useState<SheetSection>(null)
  const [splitParts, setSplitParts] = useState(1)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
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

  // Edits save on their own a moment after you stop typing. The latest item
  // and save go through refs so a re-render doesn't restart the timer.
  const saveRef = useRef((f: PlanItemFormFields) => actions.save(item, withBooking(f)))
  useEffect(() => {
    saveRef.current = (f: PlanItemFormFields) => actions.save(item, withBooking(f))
  })
  // lastSaved is what the server has, so opening the sheet (or a re-render)
  // never writes anything: only a real change does.
  const lastSaved = useRef(JSON.stringify(fields))
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (JSON.stringify(fields) === lastSaved.current) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      void autoSave(fields)
    }, AUTO_SAVE_DEBOUNCE_MS)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [fields])

  async function autoSave(f: PlanItemFormFields) {
    if (!f.title.trim()) return
    setSaveStatus('saving')
    try {
      await saveRef.current(f)
      lastSaved.current = JSON.stringify(f)
      setSaveStatus('saved')
    } catch {
      setSaveStatus('error')
    }
  }

  // Save writes now (with a split, when asked for one) and closes.
  async function handleSave() {
    if (!fields.title.trim()) return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
    setError(null)
    setBusy(true)
    try {
      await actions.save(item, withBooking(fields), splitParts)
      onClose()
    } catch (err) {
      setError(err instanceof PlanItemValidationError ? err.message : 'Could not save changes.')
    } finally {
      setBusy(false)
    }
  }

  const statusState = {
    booking: bookingOfItem(item),
    happened: happenedOf(item.status),
    spontaneous: !!item.spontaneous,
  }
  const statusKinds = { booking: !isNote && !includedIn, happened: true, spontaneous: true }

  return createPortal(
    <div
      className="details-overlay"
      style={box ? { top: box.top, height: box.height, bottom: 'auto' } : undefined}
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
            <span className="add-sheet-eyebrow details-eyebrow">{dayLabel}</span>
            {saveStatus !== 'idle' && (
              <span
                className={`details-save details-save--${saveStatus}`}
                aria-live="polite"
                aria-label={
                  saveStatus === 'saving'
                    ? 'Saving…'
                    : saveStatus === 'saved'
                      ? 'Saved'
                      : 'Save failed'
                }
              >
                {saveStatus === 'saving' && 'Saving…'}
                {saveStatus === 'saved' && 'Saved'}
                {saveStatus === 'error' && (
                  <>
                    Not saved.{' '}
                    <button
                      type="button"
                      className="details-save-retry"
                      onClick={() => void autoSave(fields)}
                    >
                      Retry
                    </button>
                  </>
                )}
              </span>
            )}
            <button type="button" className="details-close" aria-label="Close" onClick={onClose}>
              <Icon name="close" size={20} />
            </button>
          </div>
        </div>

        <div className="details-body">
          <ItemSheetFields
            fields={fields}
            onChange={setFields}
            open={open}
            onOpen={setOpen}
            splitParts={splitParts}
            onSplitParts={setSplitParts}
            titleLabel="Title"
            statusRow={
              <>
                <button
                  type="button"
                  className="add-sheet-row"
                  aria-expanded={open === 'status'}
                  onClick={() => setOpen(open === 'status' ? null : 'status')}
                >
                  <Icon name="check" size={20} />
                  <span className="add-sheet-label">Status</span>
                  <span
                    className={`bk-chip bk-chip--${chipTone(statusState, statusKinds, !!includedIn)} details-status-chip`}
                  >
                    {chipText(statusState, statusKinds, !!includedIn)}
                  </span>
                </button>
                {open === 'status' && (
                  <div className="add-sheet-panel">
                    <StatusOptions
                      compact
                      state={statusState}
                      kinds={statusKinds}
                      includedIn={includedIn?.name}
                      disabled={busy}
                      onChange={(next) =>
                        void run(
                          () => actions.applyStatus(item, next),
                          'Could not change the status.',
                        )
                      }
                    />
                  </div>
                )}
              </>
            }
          />

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
                  {euroWhole(item.cost)} counts as <b>booked</b>. Mark it paid or done and it moves
                  to spent.
                </>
              )}
            </p>
          )}

          <PackagePicker item={item} date={currentDate} />

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
        <div className="add-sheet-footer details-footer">
          <button
            type="button"
            className="add-sheet-btn add-sheet-btn--primary"
            onClick={() => void handleSave()}
            disabled={busy || !fields.title.trim()}
          >
            Save
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
