import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  PlanItemValidationError,
  UnauthorizedError,
  createPlanItem,
  demotePlanItem,
  fetchDay,
  movePlanItem,
  reorderPlanItems,
  setPlanItemStatus,
  updatePlanItem,
  datesInRange,
  type Day,
  type PlanItem,
  type PlanItemInput,
  type Stay,
} from '../lib/api'
import { useTripShell } from './useTripShell'

// BottomSheet renders children in a bottom-anchored sliding panel on mobile
// (viewport ≤ 640 px). On wider viewports the children render inline with no
// wrapper — callers do not need to know which mode is active.
function BottomSheet({
  open,
  onClose,
  label,
  children,
}: {
  open: boolean
  onClose: () => void
  label: string
  children: React.ReactNode
}) {
  // Lock body scroll while the sheet is open.
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (!open) return null

  return (
    <div
      className="bottom-sheet-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bottom-sheet">
        <div className="bottom-sheet-handle" aria-hidden="true" />
        <button
          type="button"
          className="bottom-sheet-close"
          aria-label="Close"
          onClick={onClose}
        >
          ✕
        </button>
        {children}
      </div>
    </div>
  )
}

// useMobile returns true when the viewport width is ≤ 640 px and tracks
// changes so components re-render on orientation / resize.
function useMobile(): boolean {
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 640px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)')
    const handler = (e: MediaQueryListEvent) => setMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return mobile
}

// statusLabel maps a plan item status to a human-readable label.
function statusLabel(status: string): string {
  switch (status) {
    case 'done':
      return 'Done'
    case 'skipped':
      return 'Skipped'
    case 'cancelled':
      return 'Cancelled'
    default:
      return ''
  }
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

// PlanItemFormFields holds the raw string values of the optional fields in the
// add/edit form. We use strings throughout so controlled inputs work without
// type coercion; numeric fields are parsed on submit.
interface PlanItemFormFields {
  title: string
  type: string
  start_time: string
  duration: string
  location: string
  booking_status: string
  cost: string
  link: string
}

function emptyFields(): PlanItemFormFields {
  return {
    title: '',
    type: '',
    start_time: '',
    duration: '',
    location: '',
    booking_status: '',
    cost: '',
    link: '',
  }
}

function fieldsFromItem(item: PlanItem): PlanItemFormFields {
  return {
    title: item.title,
    type: item.type ?? '',
    start_time: item.start_time ? item.start_time.slice(0, 5) : '',
    duration: item.duration ?? '',
    location: item.location ?? '',
    booking_status: item.booking_status ?? '',
    cost: item.cost != null ? String(item.cost) : '',
    link: item.link ?? '',
  }
}

function fieldsToInput(
  fields: PlanItemFormFields,
  dayId: string | null | undefined,
): PlanItemInput {
  return {
    title: fields.title.trim(),
    day_id: dayId ?? null,
    type: fields.type.trim() || null,
    start_time: fields.start_time.trim() || null,
    duration: fields.duration.trim() || null,
    location: fields.location.trim() || null,
    booking_status: fields.booking_status.trim() || null,
    cost: fields.cost.trim() ? parseFloat(fields.cost) : null,
    link: fields.link.trim() || null,
  }
}

// AUTO_SAVE_DEBOUNCE_MS is the delay before a pending edit is flushed to the
// server. Kept short enough to feel instant but long enough to coalesce rapid
// keystrokes into a single write.
const AUTO_SAVE_DEBOUNCE_MS = 800

// PlanItemForm is the shared add/edit form used in both the day and backlog
// views. It renders a compact title-only quick path; clicking "More options"
// reveals the optional fields.
//
// When onAutoSave is provided (edit mode), field changes are debounced and
// sent automatically; a subtle status badge surfaces saving/saved/error state.
interface PlanItemFormProps {
  initialFields?: PlanItemFormFields
  submitLabel: string
  onSubmit: (fields: PlanItemFormFields) => Promise<void>
  onCancel?: () => void
  onAutoSave?: (fields: PlanItemFormFields) => Promise<void>
  error: string | null
}

function PlanItemForm({
  initialFields,
  submitLabel,
  onSubmit,
  onCancel,
  onAutoSave,
  error,
}: PlanItemFormProps) {
  const [fields, setFields] = useState<PlanItemFormFields>(initialFields ?? emptyFields())
  const [expanded, setExpanded] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const optionalId = useId()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Skip auto-save on the initial render so opening the edit form doesn't
  // immediately trigger a write.
  const isFirstRender = useRef(true)

  useEffect(() => {
    if (!onAutoSave) return
    if (isFirstRender.current) {
      isFirstRender.current = false
      return
    }
    if (timerRef.current) clearTimeout(timerRef.current)
    const timerId = setTimeout(async () => {
      if (!fields.title.trim()) return
      setSaveStatus('saving')
      try {
        await onAutoSave(fields)
        setSaveStatus('saved')
      } catch {
        setSaveStatus('error')
      }
    }, AUTO_SAVE_DEBOUNCE_MS)
    timerRef.current = timerId
    return () => {
      clearTimeout(timerId)
    }
  }, [fields, onAutoSave])

  async function retryAutoSave() {
    if (!onAutoSave) return
    setSaveStatus('saving')
    try {
      await onAutoSave(fields)
      setSaveStatus('saved')
    } catch {
      setSaveStatus('error')
    }
  }

  function set(key: keyof PlanItemFormFields, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!fields.title.trim()) return
    setSubmitting(true)
    try {
      await onSubmit(fields)
      // Reset after a successful quick-add (edit forms unmount on save instead).
      if (!initialFields) setFields(emptyFields())
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="plan-item-form" onSubmit={handleSubmit} aria-label="Plan item form">
      <div className="plan-item-form-row">
        <input
          className="plan-item-form-title"
          type="text"
          placeholder="Add activity…"
          value={fields.title}
          onChange={(e) => set('title', e.target.value)}
          required
          aria-label="Title"
          disabled={submitting}
          autoFocus={!!initialFields}
        />
        <button
          type="submit"
          className="plan-item-form-submit"
          disabled={submitting || !fields.title.trim()}
          aria-label={submitLabel}
        >
          {submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            className="plan-item-form-cancel"
            onClick={onCancel}
            disabled={submitting}
            aria-label="Cancel"
          >
            Cancel
          </button>
        )}
      </div>

      <button
        type="button"
        className="plan-item-form-toggle"
        onClick={() => setExpanded((x) => !x)}
        aria-expanded={expanded}
        aria-controls={optionalId}
      >
        {expanded ? 'Fewer options' : 'More options'}
      </button>

      {expanded && (
        <div className="plan-item-form-optional" id={optionalId}>
          <label className="plan-item-form-label">
            Type
            <input
              className="plan-item-form-field"
              type="text"
              value={fields.type}
              onChange={(e) => set('type', e.target.value)}
              placeholder="e.g. food, museum"
              disabled={submitting}
            />
          </label>
          <label className="plan-item-form-label">
            Start time
            <input
              className="plan-item-form-field"
              type="time"
              value={fields.start_time}
              onChange={(e) => set('start_time', e.target.value)}
              disabled={submitting}
            />
          </label>
          <label className="plan-item-form-label">
            Duration
            <input
              className="plan-item-form-field"
              type="text"
              value={fields.duration}
              onChange={(e) => set('duration', e.target.value)}
              placeholder="e.g. 01:30"
              disabled={submitting}
            />
          </label>
          <label className="plan-item-form-label">
            Location
            <input
              className="plan-item-form-field"
              type="text"
              value={fields.location}
              onChange={(e) => set('location', e.target.value)}
              disabled={submitting}
            />
          </label>
          <label className="plan-item-form-label">
            Booking
            <input
              className="plan-item-form-field"
              type="text"
              value={fields.booking_status}
              onChange={(e) => set('booking_status', e.target.value)}
              placeholder="e.g. confirmed"
              disabled={submitting}
            />
          </label>
          <label className="plan-item-form-label">
            Cost
            <input
              className="plan-item-form-field"
              type="number"
              min="0"
              step="0.01"
              value={fields.cost}
              onChange={(e) => set('cost', e.target.value)}
              disabled={submitting}
            />
          </label>
          <label className="plan-item-form-label">
            Link
            <input
              className="plan-item-form-field"
              type="url"
              value={fields.link}
              onChange={(e) => set('link', e.target.value)}
              disabled={submitting}
            />
          </label>
        </div>
      )}

      {onAutoSave && saveStatus !== 'idle' && (
        <p
          className={`plan-item-save-status plan-item-save-status--${saveStatus}`}
          aria-live="polite"
          aria-label={
            saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved' : 'Save failed'
          }
        >
          {saveStatus === 'saving' && 'Saving…'}
          {saveStatus === 'saved' && 'Saved'}
          {saveStatus === 'error' && (
            <>
              Could not save.{' '}
              <button type="button" className="plan-item-save-retry" onClick={retryAutoSave}>
                Retry
              </button>
            </>
          )}
        </p>
      )}

      {error && (
        <p role="alert" className="plan-item-form-error">
          {error}
        </p>
      )}
    </form>
  )
}

// MoveToDayPicker is the inline day-picker shown when the user clicks "Move…"
// on a plan item. It fetches the target day to resolve date → UUID and calls
// movePlanItem on confirm.
function MoveToDayPicker({
  tripId,
  item,
  tripDates,
  currentDate,
  onMoved,
  onCancel,
}: {
  tripId: string
  item: PlanItem
  tripDates: string[]
  currentDate: string
  onMoved: (itemId: string) => void
  onCancel: () => void
}) {
  const otherDates = tripDates.filter((d) => d !== currentDate)
  const [selectedDate, setSelectedDate] = useState(otherDates[0] ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleMove() {
    if (!selectedDate) return
    setBusy(true)
    setError(null)
    try {
      const targetDay = await fetchDay(tripId, selectedDate)
      await movePlanItem(tripId, item.id, targetDay.id)
      onMoved(item.id)
    } catch {
      setError('Could not move item.')
    } finally {
      setBusy(false)
    }
  }

  if (otherDates.length === 0) {
    return (
      <span className="plan-item-move-picker">
        <span className="plan-item-move-picker-empty">No other days in trip.</span>
        <button type="button" className="plan-item-move-cancel" onClick={onCancel}>
          Cancel
        </button>
      </span>
    )
  }

  return (
    <span className="plan-item-move-picker">
      <select
        className="plan-item-move-select"
        value={selectedDate}
        onChange={(e) => setSelectedDate(e.target.value)}
        disabled={busy}
        aria-label="Target day"
      >
        {otherDates.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="plan-item-move-confirm"
        onClick={handleMove}
        disabled={busy || !selectedDate}
      >
        Move
      </button>
      <button type="button" className="plan-item-move-cancel" onClick={onCancel} disabled={busy}>
        Cancel
      </button>
      {error && (
        <span role="alert" className="plan-item-move-error">
          {error}
        </span>
      )}
    </span>
  )
}

// PlanItemRow renders a single plan item and enters inline-edit mode on click.
// It also exposes status, move-to-day, and demote-to-backlog affordances.
// On mobile the edit form opens in a BottomSheet; touch reorder uses up/down buttons.
function PlanItemRow({
  item,
  tripId,
  day,
  tripDates,
  draggable: isDraggable,
  onUpdated,
  onRemoved,
  onDragStart,
  onDragOver,
  onDrop,
  onMoveUp,
  onMoveDown,
}: {
  item: PlanItem
  tripId: string
  day: Day
  tripDates: string[]
  draggable?: boolean
  onUpdated: (updated: PlanItem) => void
  onRemoved: (itemId: string) => void
  onDragStart?: (e: React.DragEvent, itemId: string) => void
  onDragOver?: (e: React.DragEvent, itemId: string) => void
  onDrop?: (e: React.DragEvent, itemId: string) => void
  onMoveUp?: () => void
  onMoveDown?: () => void
}) {
  const mobile = useMobile()
  const [editing, setEditing] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [showMovePicker, setShowMovePicker] = useState(false)
  const [statusBusy, setStatusBusy] = useState(false)
  const [demoteBusy, setDemoteBusy] = useState(false)

  const isDone = item.status === 'done'
  const isSkipped = item.status === 'skipped'
  const isCancelled = item.status === 'cancelled'
  const inactive = isSkipped || isCancelled
  const label = statusLabel(item.status)

  async function handleSave(fields: PlanItemFormFields) {
    setEditError(null)
    try {
      const updated = await updatePlanItem(tripId, item.id, fieldsToInput(fields, item.day_id))
      onUpdated(updated)
      setEditing(false)
    } catch (err) {
      if (err instanceof PlanItemValidationError) {
        setEditError(err.message)
      } else {
        setEditError('Could not save changes.')
      }
    }
  }

  const handleAutoSave = useCallback(
    async (fields: PlanItemFormFields) => {
      const updated = await updatePlanItem(tripId, item.id, fieldsToInput(fields, item.day_id))
      onUpdated(updated)
    },
    [tripId, item.id, item.day_id, onUpdated],
  )

  async function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newStatus = e.target.value
    setStatusBusy(true)
    try {
      const updated = await setPlanItemStatus(tripId, item.id, newStatus)
      onUpdated(updated)
    } catch {
      // leave status unchanged on failure
    } finally {
      setStatusBusy(false)
    }
  }

  async function handleDemote() {
    setDemoteBusy(true)
    try {
      await demotePlanItem(tripId, item.id)
      onRemoved(item.id)
    } catch {
      setDemoteBusy(false)
    }
  }

  const editForm = (
    <PlanItemForm
      initialFields={fieldsFromItem(item)}
      submitLabel="Save"
      onSubmit={handleSave}
      onCancel={() => {
        setEditing(false)
        setEditError(null)
      }}
      onAutoSave={handleAutoSave}
      error={editError}
    />
  )

  if (editing && mobile) {
    return (
      <>
        {/* Keep the item row visible behind the sheet */}
        <li
          className="plan-item"
          aria-label={item.title}
        >
          <div className="plan-item-main">
            <span className="plan-item-title">{item.title}</span>
          </div>
        </li>
        <BottomSheet
          open
          onClose={() => {
            setEditing(false)
            setEditError(null)
          }}
          label={`Edit ${item.title}`}
        >
          {editForm}
        </BottomSheet>
      </>
    )
  }

  if (editing) {
    return (
      <li className="plan-item plan-item--editing">
        {editForm}
      </li>
    )
  }

  return (
    <li
      className={[
        'plan-item',
        isDone ? 'plan-item--done' : '',
        isSkipped ? 'plan-item--skipped' : '',
        isCancelled ? 'plan-item--cancelled' : '',
        isDraggable ? 'plan-item--draggable' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={item.title + (label ? ` — ${label}` : '')}
      draggable={isDraggable}
      onDragStart={isDraggable && onDragStart ? (e) => onDragStart(e, item.id) : undefined}
      onDragOver={isDraggable && onDragOver ? (e) => onDragOver(e, item.id) : undefined}
      onDrop={isDraggable && onDrop ? (e) => onDrop(e, item.id) : undefined}
    >
      <div className="plan-item-main">
        {isDraggable && !mobile && (
          <span className="plan-item-drag-handle" aria-hidden="true">
            ⠿
          </span>
        )}
        {isDraggable && mobile && (
          <div className="plan-item-touch-reorder" aria-label="Reorder">
            <button
              type="button"
              className="plan-item-reorder-btn"
              onClick={onMoveUp}
              disabled={!onMoveUp}
              aria-label={`Move ${item.title} up`}
            >
              ↑
            </button>
            <button
              type="button"
              className="plan-item-reorder-btn"
              onClick={onMoveDown}
              disabled={!onMoveDown}
              aria-label={`Move ${item.title} down`}
            >
              ↓
            </button>
          </div>
        )}
        <button
          type="button"
          className="plan-item-edit-btn"
          aria-label={`Edit ${item.title}`}
          onClick={() => setEditing(true)}
        >
          <span className="plan-item-title" style={inactive ? { opacity: 0.5 } : undefined}>
            {item.title}
          </span>
          {item.start_time && (
            <>
              {' '}
              <span className="plan-item-time" aria-label={`Start time: ${item.start_time}`}>
                {item.start_time.slice(0, 5)}
              </span>
            </>
          )}
          {item.location && (
            <>
              {' '}
              <span className="plan-item-location">{item.location}</span>
            </>
          )}
          {label && (
            <>
              {' '}
              <span className="plan-item-status-badge">{label}</span>
            </>
          )}
        </button>
      </div>

      <div className="plan-item-actions">
        <select
          className="plan-item-status-select"
          value={item.status}
          onChange={handleStatusChange}
          disabled={statusBusy}
          aria-label={`Status: ${item.status}`}
        >
          <option value="planned">Planned</option>
          <option value="done">Done</option>
          <option value="skipped">Skipped</option>
          <option value="cancelled">Cancelled</option>
        </select>

        {showMovePicker ? (
          <MoveToDayPicker
            tripId={tripId}
            item={item}
            tripDates={tripDates}
            currentDate={day.date}
            onMoved={(id) => {
              setShowMovePicker(false)
              onRemoved(id)
            }}
            onCancel={() => setShowMovePicker(false)}
          />
        ) : (
          <button
            type="button"
            className="plan-item-move-btn"
            onClick={() => setShowMovePicker(true)}
            aria-label={`Move ${item.title} to another day`}
          >
            Move…
          </button>
        )}

        <button
          type="button"
          className="plan-item-demote-btn"
          onClick={handleDemote}
          disabled={demoteBusy}
          aria-label={`Move ${item.title} to backlog`}
        >
          → Backlog
        </button>
      </div>
    </li>
  )
}

// QuickAddForm is the inline add form shown at the bottom of the planning
// section. On mobile it renders as a large "+" FAB button that opens a
// BottomSheet; on desktop the form is always visible inline.
function QuickAddForm({
  tripId,
  dayId,
  onAdded,
}: {
  tripId: string
  dayId: string | null
  onAdded: (item: PlanItem) => void
}) {
  const mobile = useMobile()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  async function handleAdd(fields: PlanItemFormFields) {
    setAddError(null)
    try {
      const item = await createPlanItem(tripId, fieldsToInput(fields, dayId))
      onAdded(item)
      if (mobile) setSheetOpen(false)
    } catch (err) {
      if (err instanceof PlanItemValidationError) {
        setAddError(err.message)
      } else {
        setAddError('Could not add item.')
      }
    }
  }

  if (mobile) {
    return (
      <>
        <button
          type="button"
          className="plan-item-fab"
          aria-label="Add activity"
          onClick={() => setSheetOpen(true)}
        >
          +
        </button>
        <BottomSheet
          open={sheetOpen}
          onClose={() => {
            setSheetOpen(false)
            setAddError(null)
          }}
          label="Add activity"
        >
          <PlanItemForm submitLabel="Add" onSubmit={handleAdd} error={addError} />
        </BottomSheet>
      </>
    )
  }

  return (
    <div className="plan-item-quick-add">
      <PlanItemForm submitLabel="Add" onSubmit={handleAdd} error={addError} />
    </div>
  )
}

// TimedSection renders plan items that have a start_time in chronological order.
function TimedSection({
  items,
  tripId,
  day,
  tripDates,
  onUpdated,
  onRemoved,
}: {
  items: PlanItem[]
  tripId: string
  day: Day
  tripDates: string[]
  onUpdated: (updated: PlanItem) => void
  onRemoved: (itemId: string) => void
}) {
  if (items.length === 0) return null
  return (
    <section className="day-plan-section day-plan-section--timed" aria-label="Timed activities">
      <h3 className="day-plan-section-title">Schedule</h3>
      <ol className="plan-item-list">
        {items.map((item) => (
          <PlanItemRow
            key={item.id}
            item={item}
            tripId={tripId}
            day={day}
            tripDates={tripDates}
            onUpdated={onUpdated}
            onRemoved={onRemoved}
          />
        ))}
      </ol>
    </section>
  )
}

// UntimedSection renders untimed plan items as a draggable loose list.
// Drag-reorder calls the reorder API with the new combined item order for the day.
function UntimedSection({
  items,
  timedItems,
  tripId,
  day,
  tripDates,
  onUpdated,
  onRemoved,
  onReordered,
}: {
  items: PlanItem[]
  timedItems: PlanItem[]
  tripId: string
  day: Day
  tripDates: string[]
  onUpdated: (updated: PlanItem) => void
  onRemoved: (itemId: string) => void
  onReordered: (newUntimed: PlanItem[]) => void
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null)

  function handleDragStart(e: React.DragEvent, itemId: string) {
    setDraggingId(itemId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', itemId)
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  function handleDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault()
    const sourceId = e.dataTransfer.getData('text/plain') || draggingId
    if (!sourceId || sourceId === targetId) {
      setDraggingId(null)
      return
    }

    const sourceIdx = items.findIndex((i) => i.id === sourceId)
    const targetIdx = items.findIndex((i) => i.id === targetId)
    if (sourceIdx === -1 || targetIdx === -1) {
      setDraggingId(null)
      return
    }

    const reordered = [...items]
    const [moved] = reordered.splice(sourceIdx, 1)
    reordered.splice(targetIdx, 0, moved)

    // Snapshot before-state so the revert below is scoped to this drag.
    const snapshot = items

    // Optimistic update; revert handled via onReordered if server fails.
    onReordered(reordered)
    setDraggingId(null)

    // Full day order: timed first (current server order), then untimed in new order.
    const allIds = [...timedItems.map((i) => i.id), ...reordered.map((i) => i.id)]
    reorderPlanItems(tripId, day.id, allIds).catch(() => {
      // Revert to the order before *this* drag only.
      onReordered(snapshot)
    })
  }

  function handleTouchReorder(idx: number, direction: 'up' | 'down') {
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1
    if (targetIdx < 0 || targetIdx >= items.length) return
    const reordered = [...items]
    ;[reordered[idx], reordered[targetIdx]] = [reordered[targetIdx], reordered[idx]]
    const snapshot = items
    onReordered(reordered)
    const allIds = [...timedItems.map((i) => i.id), ...reordered.map((i) => i.id)]
    reorderPlanItems(tripId, day.id, allIds).catch(() => {
      onReordered(snapshot)
    })
  }

  if (items.length === 0) return null
  return (
    <section className="day-plan-section day-plan-section--untimed" aria-label="Untimed activities">
      <h3 className="day-plan-section-title">Activities</h3>
      <ul className="plan-item-list">
        {items.map((item, idx) => (
          <PlanItemRow
            key={item.id}
            item={item}
            tripId={tripId}
            day={day}
            tripDates={tripDates}
            draggable
            onUpdated={onUpdated}
            onRemoved={onRemoved}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onMoveUp={idx > 0 ? () => handleTouchReorder(idx, 'up') : undefined}
            onMoveDown={idx < items.length - 1 ? () => handleTouchReorder(idx, 'down') : undefined}
          />
        ))}
      </ul>
    </section>
  )
}

// StaysSection renders accommodation stays covering this day.
function StaysSection({ stays }: { stays: Stay[] }) {
  if (stays.length === 0) return null
  return (
    <section className="day-stays-section" aria-label="Accommodation">
      <h3 className="day-stays-section-title">Staying</h3>
      <ul className="stay-list">
        {stays.map((stay) => (
          <li key={stay.id} className="stay-item">
            <div className="stay-name">{stay.name}</div>
            {stay.location && <div className="stay-location">{stay.location}</div>}
            {stay.check_in && stay.check_out && (
              <div
                className="stay-dates"
                aria-label={`Check in ${stay.check_in}, check out ${stay.check_out}`}
              >
                {stay.check_in} – {stay.check_out}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

// BacklogLink renders a link/button to access the ideas backlog for the trip.
function BacklogLink({ tripId }: { tripId: string }) {
  return (
    <section className="day-backlog-section" aria-label="Ideas backlog">
      <Link
        to={`/trips/${tripId}/backlog`}
        className="day-backlog-link"
        aria-label="View ideas backlog"
      >
        💡 Ideas backlog
      </Link>
    </section>
  )
}

// PlanningSection replaces the old PlanningSlot placeholder with real content:
// stays, timed items, untimed items, quick-add form, and a link to the ideas
// backlog. Re-planning affordances (reorder, move, demote, status) are wired
// to the Epic 03–04 API operations.
function PlanningSection({ day, tripId }: { day: Day; tripId: string }) {
  const { trip } = useTripShell()
  const tripDates = datesInRange(trip.start_date, trip.end_date)
  const [items, setItems] = useState<PlanItem[]>(day.plan_items)

  const timed = items.filter((item) => item.start_time != null)
  const untimed = items.filter((item) => item.start_time == null)

  function handleAdded(item: PlanItem) {
    setItems((prev) => [...prev, item])
  }

  function handleUpdated(updated: PlanItem) {
    setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))
  }

  function handleRemoved(itemId: string) {
    setItems((prev) => prev.filter((i) => i.id !== itemId))
  }

  function handleReordered(newUntimed: PlanItem[]) {
    setItems((prev) => [...prev.filter((i) => i.start_time != null), ...newUntimed])
  }

  return (
    <section className="day-slot day-slot-planning" aria-label="Planning" data-slot="planning">
      <h2 className="day-slot-title">Plan</h2>
      <StaysSection stays={day.stays} />
      <TimedSection
        items={timed}
        tripId={tripId}
        day={day}
        tripDates={tripDates}
        onUpdated={handleUpdated}
        onRemoved={handleRemoved}
      />
      <UntimedSection
        items={untimed}
        timedItems={timed}
        tripId={tripId}
        day={day}
        tripDates={tripDates}
        onUpdated={handleUpdated}
        onRemoved={handleRemoved}
        onReordered={handleReordered}
      />
      {items.length === 0 && day.stays.length === 0 && (
        <p className="day-plan-empty">Nothing planned yet.</p>
      )}
      <QuickAddForm tripId={tripId} dayId={day.id} onAdded={handleAdded} />
      <BacklogLink tripId={tripId} />
    </section>
  )
}

// BudgetSlot is the stable mount point Milestone 05 fills with per-day budget
// figures.
function BudgetSlot() {
  return (
    <section className="day-slot day-slot-budget" aria-label="Budget" data-slot="budget">
      <h2 className="day-slot-title">Budget</h2>
      <p className="day-slot-placeholder">Budget breakdown coming in Milestone 05</p>
    </section>
  )
}

// JournalSlot is the stable mount point Milestone 06 fills with journal entries.
function JournalSlot() {
  return (
    <section className="day-slot day-slot-journal" aria-label="Journal" data-slot="journal">
      <h2 className="day-slot-title">Journal</h2>
      <p className="day-slot-placeholder">Journal entries coming in Milestone 06</p>
    </section>
  )
}

// MapSlot is the stable mount point Milestone 07 fills with the day's map view.
function MapSlot() {
  return (
    <section className="day-slot day-slot-map" aria-label="Map" data-slot="map">
      <h2 className="day-slot-title">Map</h2>
      <p className="day-slot-placeholder">Map view coming in Milestone 07</p>
    </section>
  )
}

// DayView renders a single trip day identified by /trips/:tripId/days/:date.
// It fetches the day from the API, shows its metadata, and renders the planning
// section (stays, timed/untimed items, quick-add, backlog link) plus placeholder
// slots for Budget (M05), Journal (M06), and Map (M07).
export function DayView() {
  const { tripId, date } = useParams<{ tripId: string; date: string }>()

  const [day, setDay] = useState<Day | null>(null)
  // fetchError is scoped to a date so stale errors from a previous date are
  // not shown when the user navigates to a new day (avoids synchronous resets).
  const [fetchError, setFetchError] = useState<{ date: string; msg: string } | null>(null)

  // Derive loading: we are loading when neither a day result nor an error for
  // the current date param is available yet — no synchronous setState needed.
  const loading = day?.date !== date && fetchError?.date !== date
  const error = fetchError !== null && fetchError.date === date ? fetchError.msg : null

  useEffect(() => {
    if (!tripId || !date) return
    const controller = new AbortController()

    fetchDay(tripId, date, controller.signal)
      .then((d) => {
        setDay(d)
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        if (err instanceof UnauthorizedError) return
        setFetchError({ date, msg: 'Could not load day.' })
      })

    return () => controller.abort()
  }, [tripId, date])

  // day.index is 0-based (server-provided); +1 gives the 1-based display number.
  const dayNumber = day ? day.index + 1 : null

  return (
    <article className="day-view" aria-label={date ? `Day ${dayNumber ?? ''} — ${date}` : 'Day'}>
      <header className="day-view-header">
        <h2 className="day-view-title">{dayNumber !== null ? `Day ${dayNumber}` : 'Day'}</h2>
        {date && (
          <time className="day-view-date" dateTime={date}>
            {date}
          </time>
        )}
      </header>

      {loading && (
        <p className="day-view-loading" aria-busy="true">
          Loading day…
        </p>
      )}
      {error && (
        <p role="alert" className="day-view-error">
          {error}
        </p>
      )}
      {day?.notes && <p className="day-view-notes">{day.notes}</p>}

      {/* Stable mount points for Milestones 04–07. Order matches the day plan
          layout in assets/02-day-plan-map.svg (PRD §4.2). */}
      <div className="day-slots">
        {day && tripId ? (
          <PlanningSection key={day.id} day={day} tripId={tripId} />
        ) : (
          <section
            className="day-slot day-slot-planning"
            aria-label="Planning"
            data-slot="planning"
          >
            <h2 className="day-slot-title">Plan</h2>
          </section>
        )}
        <BudgetSlot />
        <JournalSlot />
        <MapSlot />
      </div>
    </article>
  )
}
