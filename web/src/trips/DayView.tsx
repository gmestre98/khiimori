import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { collectLocatedItems } from './locatedItems'
import { StaySlot } from './StaySlot'
import { splitAmount } from './splitAmount'
import {
  PlanItemValidationError,
  UnauthorizedError,
  createPlanItem,
  deletePlanItem,
  demotePlanItem,
  fetchBudgetRollup,
  fetchDay,
  movePlanItem,
  reorderPlanItems,
  reorderPlanItemsActual,
  setPlanItemStatus,
  updatePlanItem,
  datesInRange,
  type BudgetLine,
  type BudgetRollup,
  type CostEntry,
  type Day,
  type PlanItem,
  type Stay,
} from '../lib/api'
import { fullDate } from '../lib/format'
import { enqueue } from '../lib/mutationQueue'
import { useIsOnline } from '../lib/useIsOnline'
import { readCache, writeCache } from '../lib/resourceCache'
import { cacheKeys } from '../lib/cacheKeys'
import { CacheStatus } from '../components/CacheStatus'
import { JournalEditor } from '../journal/JournalEditor'
import { FastAddCost } from './FastAddCost'
import { DayExtraEditor } from './BudgetEditor'
import { DayRollup } from './RollupDisplay'
import { dayBudgetTotal, patchRollupPlanned } from './budgetModel'
import { useTripShell } from './useTripShell'
import { BottomSheet, PlanItemForm, QuickAddForm } from './PlanItemForm'
import {
  fieldsFromItem,
  fieldsToInput,
  mergeInput,
  tempPlanItem,
  useMobile,
  type PlanItemFormFields,
} from './planItemForm.helpers'

const DayMap = lazy(() => import('./DayMap'))

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

// PLAN_HIDDEN_KEY persists whether the Plan group is collapsed, so someone
// reliving a past trip can keep the itinerary tucked away and read "what
// happened" without re-hiding it on every day.
const PLAN_HIDDEN_KEY = 'khiimori:planHidden'

function readPlanHidden(): boolean {
  try {
    return localStorage.getItem(PLAN_HIDDEN_KEY) === '1'
  } catch {
    return false
  }
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
  // onMoved reports the move so the source day can drop the item (itemId) and a
  // multi-day parent can add it to the target day in place (targetDate + moved) —
  // no reload needed to see it land.
  onMoved: (itemId: string, targetDate: string, moved: PlanItem) => void
  onCancel: () => void
}) {
  const online = useIsOnline()
  const otherDates = tripDates.filter((d) => d !== currentDate)
  const [selectedDate, setSelectedDate] = useState(otherDates[0] ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleMove() {
    if (!selectedDate) return
    setBusy(true)
    setError(null)
    try {
      if (!online) {
        // Offline: resolve the target day's id from the cache (fetchDay would
        // fail), queue the move, and add the item to the target day's cache so it
        // shows there immediately and survives an offline reload. Removal from the
        // current day is handled by onMoved (its cache write lives in DayView).
        const cached = await readCache<Day>(cacheKeys.day(tripId, selectedDate))
        if (!cached) {
          setError("That day isn't cached for offline use yet.")
          return
        }
        await enqueue('movePlanItem', { tripId, itemId: item.id, dayId: cached.data.id })
        const moved: PlanItem = {
          ...item,
          day_id: cached.data.id,
          sort_order: Number.MAX_SAFE_INTEGER,
        }
        void writeCache(cacheKeys.day(tripId, selectedDate), {
          ...cached.data,
          plan_items: [...cached.data.plan_items, moved],
        })
        onMoved(item.id, selectedDate, moved)
        return
      }
      const targetDay = await fetchDay(tripId, selectedDate)
      await movePlanItem(tripId, item.id, targetDay.id)
      const moved: PlanItem = {
        ...item,
        day_id: targetDay.id,
        sort_order: Number.MAX_SAFE_INTEGER,
      }
      onMoved(item.id, selectedDate, moved)
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
// On mobile the edit form opens in a BottomSheet; touch reorder is a finger drag
// on the grip handle (pointer events), mirroring desktop's mouse drag.
function PlanItemRow({
  item,
  tripId,
  day,
  tripDates,
  draggable: isDraggable,
  isTouchDragging,
  isSelected,
  pinNumber,
  onSelect,
  onUpdated,
  onAdded,
  onRemoved,
  onDragStart,
  onDragOver,
  onDrop,
  onTouchDragStart,
  onTouchDragMove,
  onTouchDragEnd,
  onItemMoved,
}: {
  item: PlanItem
  tripId: string
  day: Day
  tripDates: string[]
  draggable?: boolean
  isTouchDragging?: boolean
  isSelected?: boolean
  pinNumber?: number
  onSelect?: () => void
  onUpdated: (updated: PlanItem) => void
  // onAdded appends a newly created sibling item (used when a split turns one
  // item into several parts on save).
  onAdded: (item: PlanItem) => void
  onRemoved: (itemId: string) => void
  // onItemMoved lets a multi-day parent add the item to its new day in place when
  // it's moved off this one (the whole-trip Plan view); omit it in single-day
  // contexts, where the target day isn't on screen.
  onItemMoved?: (targetDate: string, item: PlanItem) => void
  onDragStart?: (e: React.DragEvent, itemId: string) => void
  onDragOver?: (e: React.DragEvent, itemId: string) => void
  onDrop?: (e: React.DragEvent, itemId: string) => void
  onTouchDragStart?: (e: React.PointerEvent, itemId: string) => void
  onTouchDragMove?: (e: React.PointerEvent) => void
  onTouchDragEnd?: (e: React.PointerEvent) => void
}) {
  const mobile = useMobile()
  const online = useIsOnline()
  const [editing, setEditing] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [showMovePicker, setShowMovePicker] = useState(false)
  // showActions gates the secondary row controls (move / backlog / delete)
  // behind a "⋯" toggle so a resting row shows only its status dropdown, not a
  // crowd of buttons.
  const [showActions, setShowActions] = useState(false)
  const [statusBusy, setStatusBusy] = useState(false)
  const [demoteBusy, setDemoteBusy] = useState(false)
  // confirmDelete gates the destructive delete behind a second click — the bin
  // button swaps to an inline "Delete? / Cancel" confirm rather than deleting on
  // the first tap.
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const rowRef = useRef<HTMLLIElement>(null)

  // Scroll the row into view when it becomes selected via a pin tap.
  useEffect(() => {
    if (isSelected) {
      rowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [isSelected])

  const isDone = item.status === 'done'
  const isSkipped = item.status === 'skipped'
  const isCancelled = item.status === 'cancelled'
  const inactive = isSkipped || isCancelled
  const label = statusLabel(item.status)

  async function handleSave(fields: PlanItemFormFields, splitParts: number) {
    setEditError(null)
    const base = fieldsToInput(fields, item.day_id)
    try {
      if (splitParts > 1 && base.cost != null && base.cost > 0) {
        // Split an existing item: divide the cost to the cent and reshape it
        // into N parts. Part 1 reuses this item (keeping its id, day, status and
        // order); the remaining parts become new sibling items on the same day.
        const shares = splitAmount(base.cost, splitParts)
        const firstInput = {
          ...base,
          title: `${base.title} (part 1/${splitParts})`,
          cost: shares[0],
        }
        const partInputs = Array.from({ length: splitParts - 1 }, (_, i) => ({
          ...base,
          title: `${base.title} (part ${i + 2}/${splitParts})`,
          cost: shares[i + 1],
        }))
        if (!online) {
          // Offline: queue the update + each new part, reflecting them optimistically.
          await enqueue('updatePlanItem', { tripId, itemId: item.id, input: firstInput })
          onUpdated(mergeInput(item, tripId, firstInput))
          for (const input of partInputs) {
            const withId = { ...input, id: crypto.randomUUID() }
            await enqueue('createPlanItem', { tripId, input: withId })
            onAdded(tempPlanItem(tripId, item.day_id ?? null, withId))
          }
          setEditing(false)
          return
        }
        const first = await updatePlanItem(tripId, item.id, firstInput)
        onUpdated(first)
        for (const input of partInputs) {
          const created = await createPlanItem(tripId, input)
          onAdded(created)
        }
        setEditing(false)
        return
      }
      if (!online) {
        await enqueue('updatePlanItem', { tripId, itemId: item.id, input: base })
        onUpdated(mergeInput(item, tripId, base))
        setEditing(false)
        return
      }
      const updated = await updatePlanItem(tripId, item.id, base)
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
      const input = fieldsToInput(fields, item.day_id)
      if (!online) {
        await enqueue('updatePlanItem', { tripId, itemId: item.id, input })
        onUpdated(mergeInput(item, tripId, input))
        return
      }
      const updated = await updatePlanItem(tripId, item.id, input)
      onUpdated(updated)
    },
    [tripId, item, online, onUpdated],
  )

  async function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newStatus = e.target.value
    setStatusBusy(true)
    try {
      if (!online) {
        // Offline: queue the status change (replayed on reconnect) and reflect it
        // optimistically so "mark as done" works without a connection. The day
        // cache write (see DayView) persists it across an offline reload.
        await enqueue('setPlanItemStatus', { tripId, itemId: item.id, status: newStatus })
        onUpdated({ ...item, status: newStatus })
        return
      }
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
      if (!online) {
        await enqueue('demotePlanItem', { tripId, itemId: item.id })
        onRemoved(item.id)
        return
      }
      await demotePlanItem(tripId, item.id)
      onRemoved(item.id)
    } catch {
      setDemoteBusy(false)
    }
  }

  async function handleDelete() {
    setDeleteBusy(true)
    try {
      if (!online) {
        await enqueue('deletePlanItem', { tripId, itemId: item.id })
        onRemoved(item.id)
        return
      }
      await deletePlanItem(tripId, item.id)
      onRemoved(item.id)
    } catch {
      setDeleteBusy(false)
      setConfirmDelete(false)
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
      actionsPlacement={mobile ? 'footer' : 'inline'}
    />
  )

  if (editing && mobile) {
    return (
      <>
        {/* Keep the item row visible behind the sheet */}
        <li className="plan-item" aria-label={item.title}>
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
    return <li className="plan-item plan-item--editing">{editForm}</li>
  }

  return (
    <li
      ref={rowRef}
      className={[
        'plan-item',
        isDone ? 'plan-item--done' : '',
        isSkipped ? 'plan-item--skipped' : '',
        isCancelled ? 'plan-item--cancelled' : '',
        isDraggable ? 'plan-item--draggable' : '',
        isTouchDragging ? 'plan-item--touch-dragging' : '',
        isSelected ? 'plan-item--selected' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-item-id={item.id}
      aria-label={item.title + (label ? ` — ${label}` : '')}
      draggable={isDraggable}
      onDragStart={isDraggable && onDragStart ? (e) => onDragStart(e, item.id) : undefined}
      // Any row can be a drop target (so an untimed item can be dropped between
      // two timed ones), but only draggable rows can be picked up. (M12.1 S6)
      onDragOver={onDragOver ? (e) => onDragOver(e, item.id) : undefined}
      onDrop={onDrop ? (e) => onDrop(e, item.id) : undefined}
    >
      <div className="plan-item-main">
        {isDraggable && !mobile && (
          <span className="plan-item-drag-handle" aria-hidden="true">
            ⠿
          </span>
        )}
        {isDraggable && mobile && (
          <button
            type="button"
            className="plan-item-touch-handle"
            aria-label={`Drag to reorder ${item.title}`}
            onPointerDown={onTouchDragStart ? (e) => onTouchDragStart(e, item.id) : undefined}
            onPointerMove={onTouchDragMove}
            onPointerUp={onTouchDragEnd}
            onPointerCancel={onTouchDragEnd}
          >
            ⠿
          </button>
        )}
        {pinNumber != null && onSelect && (
          <button
            type="button"
            className={[
              'plan-item-pin-badge',
              // A transport leg shows its single number between a start and finish
              // dot (a mini of the map's start→finish arrow) so the badge reads as
              // a route, not a place.
              item.kind === 'transport' ? 'plan-item-pin-badge--transport' : '',
              isSelected ? 'plan-item-pin-badge--selected' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-label={`Map pin ${pinNumber} for ${item.title}`}
            aria-pressed={isSelected}
            onClick={onSelect}
          >
            {item.kind === 'transport' && <span className="plan-item-pin-dot" aria-hidden="true" />}
            {pinNumber}
            {item.kind === 'transport' && (
              <span className="plan-item-pin-dot plan-item-pin-dot--to" aria-hidden="true" />
            )}
          </button>
        )}
        <button
          type="button"
          className="plan-item-edit-btn"
          aria-label={`Edit ${item.title}`}
          onClick={() => setEditing(true)}
        >
          {item.start_time && (
            <span className="plan-item-time" aria-label={`Start time: ${item.start_time}`}>
              {item.start_time.slice(0, 5)}
            </span>
          )}
          <span className="plan-item-title" style={inactive ? { opacity: 0.5 } : undefined}>
            {item.title}
          </span>
          {item.location && <span className="plan-item-location">{item.location}</span>}
          {label && <span className="plan-item-status-badge">{label}</span>}
          {item.note && <span className="plan-item-note">{item.note}</span>}
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

        <button
          type="button"
          className={['plan-item-more-btn', showActions ? 'plan-item-more-btn--open' : '']
            .filter(Boolean)
            .join(' ')}
          onClick={() => {
            // Collapsing resets any half-open secondary UI so it never lingers
            // hidden.
            setShowActions((v) => !v)
            setShowMovePicker(false)
            setConfirmDelete(false)
          }}
          aria-expanded={showActions}
          aria-label={`More actions for ${item.title}`}
          title="More actions"
        >
          ⋯
        </button>

        {showActions && (
          <>
            {showMovePicker ? (
              <MoveToDayPicker
                tripId={tripId}
                item={item}
                tripDates={tripDates}
                currentDate={day.date}
                onMoved={(id, targetDate, moved) => {
                  setShowMovePicker(false)
                  onRemoved(id)
                  onItemMoved?.(targetDate, moved)
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

            {confirmDelete ? (
              <span className="plan-item-delete-confirm">
                <button
                  type="button"
                  className="plan-item-delete-yes"
                  onClick={handleDelete}
                  disabled={deleteBusy}
                  aria-label={`Confirm delete ${item.title}`}
                >
                  Delete?
                </button>
                <button
                  type="button"
                  className="plan-item-delete-cancel"
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleteBusy}
                  aria-label="Cancel delete"
                >
                  Cancel
                </button>
              </span>
            ) : (
              <button
                type="button"
                className="plan-item-delete-btn"
                onClick={() => setConfirmDelete(true)}
                aria-label={`Delete ${item.title}`}
                title="Delete"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V7m4 4v6m4-6v6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            )}
          </>
        )}
      </div>
    </li>
  )
}

// TimedSection renders plan items that have a start_time in chronological order.
// orderTimeline arranges a day's items into the unified timeline (M12.1 S6):
// timed items always read in clock order, while untimed items hold whatever
// position they were dropped into (including between two timed items). It walks
// the current sequence and, at each timed slot, drops in the next
// chronologically-sorted timed item; untimed items stay where they are. This
// keeps "set a time → it slots into place" working purely from render, while a
// drag decides an untimed item's spot.
function orderTimeline(items: PlanItem[]): PlanItem[] {
  const timedSorted = items
    .filter((i) => i.start_time != null)
    .slice()
    .sort((a, b) => (a.start_time as string).localeCompare(b.start_time as string))
  let t = 0
  return items.map((i) => (i.start_time != null ? timedSorted[t++] : i))
}

// mergeSubsetOrder repositions the members of `subset` within the full day list
// to the subset's new relative order, leaving every non-member fixed in place.
// The Plan and What-happened sections each show a filtered slice of the day's
// items but share one sort_order; reordering within either slice folds back
// here so the other slice — and the map's pin numbers — stay consistent.
function mergeSubsetOrder(full: PlanItem[], subset: PlanItem[]): PlanItem[] {
  const ids = new Set(subset.map((i) => i.id))
  let k = 0
  return full.map((item) => (ids.has(item.id) ? subset[k++] : item))
}

// buzz gives a short haptic tick on devices that support it — used to confirm a
// drag pickup and each reorder step so a finger drag feels physical. A no-op
// where the Vibration API is absent (desktop, iOS Safari).
function buzz(ms: number) {
  try {
    navigator.vibrate?.(ms)
  } catch {
    // ignore — vibration is a nicety, never required
  }
}

// ReorderableItemList renders an <ol> of plan-item rows that can be reordered by
// dragging: a mouse drag on desktop, or a finger drag on the grip handle on
// mobile. Only untimed rows can be picked up (timed rows are pinned by clock
// time), but any row is a drop target so an untimed item can land between two
// timed ones. It manages only the live drag preview and reports the new order
// via onReordered — persisting it (and merging back into the full day list) is
// the caller's job, so the same list drives both the Plan and What-happened
// sections over one shared sort order.
function ReorderableItemList({
  items,
  tripId,
  day,
  tripDates,
  selectedId,
  pinNumberForId,
  onSelect,
  onUpdated,
  onAdded,
  onRemoved,
  onReordered,
  onItemMoved,
  pinTimed = true,
}: {
  items: PlanItem[]
  tripId: string
  day: Day
  tripDates: string[]
  selectedId?: string | null
  pinNumberForId?: (id: string) => number | undefined
  onSelect?: (id: string | null) => void
  onUpdated: (updated: PlanItem) => void
  onAdded: (item: PlanItem) => void
  onRemoved: (itemId: string) => void
  onReordered: (newOrder: PlanItem[]) => void
  onItemMoved?: (targetDate: string, item: PlanItem) => void
  // pinTimed (default true) pins timed rows to clock order and lets only untimed
  // rows be dragged — the Plan timeline. The "What happened" list passes false:
  // it's a free manual order (what you actually did, which can differ from the
  // planned times), so every row is draggable and the given order is shown as-is.
  pinTimed?: boolean
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  // Touch drag (mobile): a pointer-driven reorder replaces the old up/down
  // buttons. touchOrder holds the live preview order while a finger is down;
  // touchDragId is the item being dragged (also used to lift the source row).
  const listRef = useRef<HTMLOListElement>(null)
  const [touchOrder, setTouchOrder] = useState<PlanItem[] | null>(null)
  const [touchDragId, setTouchDragId] = useState<string | null>(null)
  const touchDragRef = useRef<string | null>(null)
  const touchOrderRef = useRef<PlanItem[] | null>(null)
  // touchMovedRef stays false for a tap that never reorders, so lifting the
  // finger without moving doesn't fire a no-op reorder request.
  const touchMovedRef = useRef(false)
  // Edge auto-scroll: while a finger drag hovers near the top/bottom of the
  // viewport we scroll the page so items can be dragged past what's on screen.
  // autoScrollRef holds the rAF handle; lastClientYRef is the finger's latest Y.
  const autoScrollRef = useRef<number | null>(null)
  const lastClientYRef = useRef(0)
  const display = touchOrder ?? (pinTimed ? orderTimeline(items) : items)

  // Stop the auto-scroll loop if we unmount mid-drag (pointerup would otherwise
  // never fire on the captured, now-gone handle, leaving the rAF chain running).
  useEffect(
    () => () => {
      if (autoScrollRef.current != null) cancelAnimationFrame(autoScrollRef.current)
    },
    [],
  )

  function report(reordered: PlanItem[]) {
    onReordered(pinTimed ? orderTimeline(reordered) : reordered)
  }

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
    setDraggingId(null)
    if (!sourceId || sourceId === targetId) return

    const sourceIdx = display.findIndex((i) => i.id === sourceId)
    const targetIdx = display.findIndex((i) => i.id === targetId)
    if (sourceIdx === -1 || targetIdx === -1) return

    const reordered = [...display]
    const [moved] = reordered.splice(sourceIdx, 1)
    reordered.splice(targetIdx, 0, moved)
    report(reordered)
  }

  // ── Touch drag (mobile) ────────────────────────────────────────────────────
  // A finger presses the grip handle, drags over the list, and lifts. We track
  // the row under the finger by its midpoint and splice a live-preview order so
  // the list rearranges as you go; on lift we report the final order.

  // reflowUnderFinger recomputes the preview order for the finger's current Y.
  // Shared by the pointer-move handler and the auto-scroll loop (so the list
  // keeps rearranging while the page scrolls even if the finger is held still).
  function reflowUnderFinger(clientY: number) {
    const id = touchDragRef.current
    const current = touchOrderRef.current
    const list = listRef.current
    if (!id || !current || !list) return
    // The row we'd insert before: the first whose vertical midpoint is below the
    // finger. null → the finger is past the last row, so append.
    let beforeId: string | null = null
    for (const row of list.querySelectorAll<HTMLElement>('[data-item-id]')) {
      const rect = row.getBoundingClientRect()
      if (clientY < rect.top + rect.height / 2) {
        beforeId = row.dataset.itemId ?? null
        break
      }
    }
    if (beforeId === id) return
    const order = [...current]
    const from = order.findIndex((i) => i.id === id)
    if (from === -1) return
    const [moved] = order.splice(from, 1)
    let insertAt = beforeId == null ? order.length : order.findIndex((i) => i.id === beforeId)
    if (insertAt === -1) insertAt = order.length
    order.splice(insertAt, 0, moved)
    if (order.every((it, i) => it.id === current[i]?.id)) return
    touchMovedRef.current = true
    touchOrderRef.current = order
    setTouchOrder(order)
    buzz(8)
  }

  // The auto-scroll loop nudges the page while the finger sits in a 72px band at
  // the top or bottom of the viewport, then reflows the list at the new scroll
  // position. It runs itself via rAF until the finger leaves the band or lifts.
  function tickAutoScroll() {
    autoScrollRef.current = null
    if (touchDragRef.current == null) return
    const y = lastClientYRef.current
    const band = 72
    const max = 14
    let dy = 0
    if (y < band) dy = -Math.ceil(((band - y) / band) * max)
    else if (y > window.innerHeight - band)
      dy = Math.ceil(((y - (window.innerHeight - band)) / band) * max)
    if (dy !== 0) {
      window.scrollBy(0, dy)
      reflowUnderFinger(y)
    }
    if (touchDragRef.current != null) {
      autoScrollRef.current = requestAnimationFrame(tickAutoScroll)
    }
  }

  function handleTouchDragStart(e: React.PointerEvent, itemId: string) {
    if (e.pointerType === 'mouse') return
    e.preventDefault()
    touchDragRef.current = itemId
    touchOrderRef.current = display
    touchMovedRef.current = false
    lastClientYRef.current = e.clientY
    setTouchDragId(itemId)
    setTouchOrder(display)
    e.currentTarget.setPointerCapture?.(e.pointerId)
    buzz(15)
    autoScrollRef.current = requestAnimationFrame(tickAutoScroll)
  }

  function handleTouchDragMove(e: React.PointerEvent) {
    if (touchDragRef.current == null) return
    e.preventDefault()
    lastClientYRef.current = e.clientY
    reflowUnderFinger(e.clientY)
  }

  function handleTouchDragEnd() {
    const order = touchOrderRef.current
    const moved = touchMovedRef.current
    touchDragRef.current = null
    touchOrderRef.current = null
    touchMovedRef.current = false
    if (autoScrollRef.current != null) {
      cancelAnimationFrame(autoScrollRef.current)
      autoScrollRef.current = null
    }
    setTouchDragId(null)
    setTouchOrder(null)
    // Only report a real reorder; a tap that didn't move anything is a no-op.
    if (moved && order) {
      buzz(20)
      report(order)
    }
  }

  return (
    <ol className="plan-item-list" ref={listRef}>
      {display.map((item) => {
        // With time-pinning (Plan) only untimed rows can be picked up — every
        // row still accepts a drop so an untimed item can land between two timed
        // ones. Without it (What happened) every row is a free drag.
        const isDraggable = pinTimed ? item.start_time == null : true
        return (
          <PlanItemRow
            key={item.id}
            item={item}
            tripId={tripId}
            day={day}
            tripDates={tripDates}
            draggable={isDraggable}
            isTouchDragging={touchDragId === item.id}
            isSelected={selectedId === item.id}
            pinNumber={pinNumberForId?.(item.id)}
            onSelect={
              onSelect ? () => onSelect(selectedId === item.id ? null : item.id) : undefined
            }
            onUpdated={onUpdated}
            onAdded={onAdded}
            onRemoved={onRemoved}
            onItemMoved={onItemMoved}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onTouchDragStart={handleTouchDragStart}
            onTouchDragMove={handleTouchDragMove}
            onTouchDragEnd={handleTouchDragEnd}
          />
        )
      })}
    </ol>
  )
}

// TimelineSection wraps ReorderableItemList in the Plan group's "Timeline"
// section. Timed items are pinned by their clock time (reorder them by changing
// the time); untimed items carry a drag handle and can be dropped anywhere.
function TimelineSection({
  items,
  tripId,
  day,
  tripDates,
  selectedId,
  pinNumberForId,
  onSelect,
  onUpdated,
  onAdded,
  onRemoved,
  onReordered,
  onItemMoved,
}: {
  items: PlanItem[]
  tripId: string
  day: Day
  tripDates: string[]
  selectedId?: string | null
  pinNumberForId?: (id: string) => number | undefined
  onSelect?: (id: string | null) => void
  onUpdated: (updated: PlanItem) => void
  onAdded: (item: PlanItem) => void
  onRemoved: (itemId: string) => void
  onReordered: (newOrder: PlanItem[]) => void
  onItemMoved?: (targetDate: string, item: PlanItem) => void
}) {
  if (orderTimeline(items).length === 0) return null
  return (
    <section className="day-plan-section day-plan-section--timeline" aria-label="Day timeline">
      <h3 className="day-plan-section-title">Timeline</h3>
      <ReorderableItemList
        items={items}
        tripId={tripId}
        day={day}
        tripDates={tripDates}
        selectedId={selectedId}
        pinNumberForId={pinNumberForId}
        onSelect={onSelect}
        onUpdated={onUpdated}
        onAdded={onAdded}
        onRemoved={onRemoved}
        onReordered={onReordered}
        onItemMoved={onItemMoved}
      />
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
export function PlanningSection({
  day,
  items,
  setItems,
  setStays,
  onStaySaved,
  onStayRemoved,
  onItemMoved,
  tripId,
  selectedId = null,
  onSelect,
  title = 'Plan',
  showBacklogLink = true,
}: {
  day: Day
  // items / setItems are owned by the parent so a sibling view (the day map, or
  // the trip-scoped Plan subtab's rail) stays in sync with edits.
  items: PlanItem[]
  setItems: React.Dispatch<React.SetStateAction<PlanItem[]>>
  // setStays updates this day's stays in the parent so the pinned stay slot and
  // the day map stay in sync after an add/edit/remove.
  setStays: React.Dispatch<React.SetStateAction<Stay[]>>
  // onStaySaved / onStayRemoved let a multi-day parent (the whole-trip Plan view)
  // reflect a stay across every night it covers. Forwarded straight to StaySlot;
  // omit them and stays update only this day.
  onStaySaved?: (saved: Stay) => void
  onStayRemoved?: (stayId: string) => void
  // onItemMoved lets a multi-day parent (the whole-trip Plan view) add a moved
  // item to its new day in place, so the target day and rail counts update without
  // a reload. Omit it in single-day contexts (the day view).
  onItemMoved?: (targetDate: string, item: PlanItem) => void
  tripId: string
  // selectedId / onSelect drive the map-pin badges (day view). Omit them in
  // map-less contexts (the Plan subtab) and no pin badges render.
  selectedId?: string | null
  onSelect?: (id: string | null) => void
  // title overrides the section heading (default "Plan"); the Plan subtab uses
  // the day's name so each stacked day is labelled. Pass null to drop the
  // heading entirely — the whole-trip stack's collapsible card head already
  // names the day, so repeating it inside is noise.
  title?: string | null
  // showBacklogLink renders the in-section backlog link (day view). The Plan
  // subtab surfaces the backlog once in its rail instead, so it opts out.
  showBacklogLink?: boolean
}) {
  const { trip } = useTripShell()
  const online = useIsOnline()
  const tripDates = datesInRange(trip.start_date, trip.end_date)
  const [planHidden, setPlanHidden] = useState(readPlanHidden)

  // Build a lookup from item/stay id → pin number (1-based) using the same
  // numbering as collectLocatedItems so badges match the map legend. A transport
  // leg is one numbered feature spanning two located points, so we read the
  // shared `feature` rather than the point's array index. Only needed when a map
  // is present (onSelect wired) — otherwise no badges are shown.
  const locatedItems = collectLocatedItems({ ...day, plan_items: items })
  const pinNumberForId = onSelect
    ? (id: string): number | undefined => {
        const li = locatedItems.find((it) => it.id === id)
        return li ? li.feature + 1 : undefined
      }
    : undefined

  function handleAdded(item: PlanItem) {
    setItems((prev) => [...prev, item])
  }

  function handleUpdated(updated: PlanItem) {
    setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))
  }

  function handleRemoved(itemId: string) {
    setItems((prev) => prev.filter((i) => i.id !== itemId))
  }

  // persistReorder is the single writer for every reorder (Plan or What
  // happened). It takes the whole day's items in their new order, stamps
  // sort_order 0,1,2,… to match — so pin numbers (derived from sort_order via
  // collectLocatedItems) update immediately instead of only after a refresh —
  // updates state optimistically, and sends the full id sequence to the server.
  function persistReorder(fullOrder: PlanItem[]) {
    const renumbered = fullOrder.map((item, idx) =>
      item.sort_order === idx ? item : { ...item, sort_order: idx },
    )
    const snapshot = items
    setItems(renumbered)
    const itemIds = renumbered.map((i) => i.id)
    if (!online) {
      // Offline: queue the reorder (replayed on reconnect) and keep the optimistic
      // order — the day-cache write in DayView persists it across an offline reload.
      void enqueue('reorderPlanItems', { tripId, dayId: day.id, itemIds })
      return
    }
    reorderPlanItems(tripId, day.id, itemIds).catch(() => setItems(snapshot))
  }

  // Reordering the Plan writes sort_order (the planned timeline). The dragged
  // slice is folded back into the full day sequence so the untouched items keep
  // their positions, then persisted as one full order.
  function handlePlanReordered(newPlanOrder: PlanItem[]) {
    const ordered = [...items].sort((a, b) => a.sort_order - b.sort_order)
    persistReorder(mergeSubsetOrder(ordered, newPlanOrder))
  }

  // persistActualReorder is the writer for the "What happened" order: it stamps
  // actual_order 0,1,2,… onto the reordered done/logged items and persists only
  // those ids to the actual-order endpoint, leaving sort_order (the plan)
  // untouched — so the two lists reorder independently.
  function persistActualReorder(newDoneOrder: PlanItem[]) {
    const orderById = new Map(newDoneOrder.map((it, idx) => [it.id, idx]))
    const snapshot = items
    const next = items.map((it) => {
      const idx = orderById.get(it.id)
      return idx == null || it.actual_order === idx ? it : { ...it, actual_order: idx }
    })
    setItems(next)
    const itemIds = newDoneOrder.map((i) => i.id)
    if (!online) {
      void enqueue('reorderPlanItemsActual', { tripId, dayId: day.id, itemIds })
      return
    }
    reorderPlanItemsActual(tripId, day.id, itemIds).catch(() => setItems(snapshot))
  }

  function handleDoneReordered(newDoneOrder: PlanItem[]) {
    persistActualReorder(newDoneOrder)
  }

  // "Plan" is the itinerary you intended: every item except ones logged after
  // the fact (unplanned). "What happened" is what actually occurred — done items
  // plus anything logged spontaneously. A planned item you did shows in BOTH, so
  // you can compare the plan against what happened; a spontaneous log shows only
  // under what happened (a no-plan day keeps an empty Plan). Skipped/cancelled
  // planned items stay under Plan so their status control is still reachable.
  // Plan reads in sort_order (items arrive that way); "What happened" reads in
  // its own actual_order so it can differ from the plan. actual_order falls back
  // to sort_order for items cached before the column shipped.
  const planItems = items.filter((i) => !i.unplanned)
  const doneItems = items
    .filter((i) => i.status === 'done' || i.unplanned)
    .sort((a, b) => (a.actual_order ?? a.sort_order) - (b.actual_order ?? b.sort_order))

  function togglePlanHidden() {
    setPlanHidden((h) => {
      const next = !h
      try {
        localStorage.setItem(PLAN_HIDDEN_KEY, next ? '1' : '0')
      } catch {
        // ignore storage failures — the toggle still works in-session
      }
      return next
    })
  }

  return (
    <section className="day-slot day-slot-planning" aria-label="Planning" data-slot="planning">
      {title !== null && <h2 className="day-slot-title">{title}</h2>}
      <StaySlot
        day={day}
        tripId={tripId}
        setStays={setStays}
        onStaySaved={onStaySaved}
        onStayRemoved={onStayRemoved}
        selectedId={selectedId}
        pinNumberForId={pinNumberForId}
        onSelect={onSelect}
      />

      <div className="day-plan-group">
        <div className="day-plan-group-head">
          <h3 className="day-plan-group-title">Plan</h3>
          <button
            type="button"
            className="day-plan-group-toggle"
            onClick={togglePlanHidden}
            aria-expanded={!planHidden}
          >
            {planHidden ? 'Show plan' : 'Hide plan'}
          </button>
        </div>
        {planHidden ? (
          <button type="button" className="day-plan-collapsed" onClick={togglePlanHidden}>
            {planItems.length === 0
              ? 'Plan hidden'
              : `Plan hidden · ${planItems.length} ${planItems.length === 1 ? 'item' : 'items'}`}
            {' · Show'}
          </button>
        ) : (
          <>
            <TimelineSection
              items={planItems}
              tripId={tripId}
              day={day}
              tripDates={tripDates}
              selectedId={selectedId}
              pinNumberForId={pinNumberForId}
              onSelect={onSelect}
              onUpdated={handleUpdated}
              onAdded={handleAdded}
              onRemoved={handleRemoved}
              onReordered={handlePlanReordered}
              onItemMoved={onItemMoved}
            />
            {planItems.length === 0 && day.stays.length === 0 && (
              <p className="day-plan-empty">Nothing planned yet.</p>
            )}
            <QuickAddForm tripId={tripId} dayId={day.id} onAdded={handleAdded} />
          </>
        )}
      </div>

      <div className="day-plan-group">
        <div className="day-plan-group-head">
          <h3 className="day-plan-group-title">What happened</h3>
        </div>
        {doneItems.length === 0 ? (
          <p className="day-plan-empty">Nothing logged yet — add what you actually did.</p>
        ) : (
          <ReorderableItemList
            items={doneItems}
            tripId={tripId}
            day={day}
            tripDates={tripDates}
            selectedId={selectedId}
            pinNumberForId={pinNumberForId}
            onSelect={onSelect}
            onUpdated={handleUpdated}
            onAdded={handleAdded}
            onRemoved={handleRemoved}
            onReordered={handleDoneReordered}
            onItemMoved={onItemMoved}
            // Free manual order (the sequence you actually did things), not the
            // planned clock order — every row drags.
            pinTimed={false}
          />
        )}
        <QuickAddForm tripId={tripId} dayId={day.id} onAdded={handleAdded} logDone />
      </div>

      {showBacklogLink && <BacklogLink tripId={tripId} />}
    </section>
  )
}

// DayBudgetStrip is the budget presence on the streamlined day screen: how the
// day is doing against its budget (spent vs planned, per category, via
// DayRollup) plus quick-add for a cost, with a link to the whole-trip Budget tab
// for deeper setup. The full per-day budget *editor* lives on the Budget tab, so
// the day screen shows the day's budget without re-hosting the setup UI.
function DayBudgetStrip({ tripId, day }: { tripId: string; day: Day }) {
  const [rollup, setRollup] = useState<BudgetRollup | null>(null)
  const [entries, setEntries] = useState<CostEntry[]>([])
  const [extraOpen, setExtraOpen] = useState(false)

  const loadRollup = useCallback(
    (signal?: AbortSignal) => {
      fetchBudgetRollup(tripId, signal)
        .then((r) => {
          setRollup(r)
          void writeCache(cacheKeys.budgetRollup(tripId), r)
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') return
        })
    },
    [tripId],
  )

  // applyOfflineLine reflects a day extra saved offline into the rollup + cache so
  // it shows immediately and survives an offline reload (mirrors TripBudgetPage).
  const applyOfflineLine = useCallback(
    (line: BudgetLine) => {
      setRollup((cur) => {
        const patched = patchRollupPlanned(cur, line)
        if (patched) void writeCache(cacheKeys.budgetRollup(tripId), patched)
        return patched
      })
    },
    [tripId],
  )

  useEffect(() => {
    const controller = new AbortController()
    let done = false
    // Instant-render: seed the roll-up from cache, then refresh. Sequencing the
    // fetch after the cache read means a slow fresh response can't be overwritten
    // by a late-arriving cached value.
    void readCache<BudgetRollup>(cacheKeys.budgetRollup(tripId)).then((cached) => {
      if (done) return
      if (cached) setRollup(cached.data)
      loadRollup(controller.signal)
    })
    return () => {
      done = true
      controller.abort()
    }
  }, [loadRollup, day.id, tripId])

  function handleEntryAdded(entry: CostEntry) {
    setEntries((prev) => [...prev, entry])
    loadRollup()
  }

  function handleEntryUpdated(entry: CostEntry) {
    setEntries((prev) => prev.map((e) => (e.id === entry.id ? entry : e)))
    loadRollup()
  }

  function handleEntryDeleted(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id))
    loadRollup()
  }

  const daySpent = rollup?.by_day?.[day.id] ?? 0
  const dayBudget = rollup ? dayBudgetTotal(rollup, day.id) : 0
  const dayUpcoming = rollup?.estimated_by_day?.[day.id] ?? 0
  // DayRollup renders nothing when the day has no spend/budget/estimate; mirror
  // its condition so we can show a hint instead of an empty budget section.
  const hasBudgetData = daySpent > 0 || dayBudget > 0 || dayUpcoming > 0

  return (
    <section className="day-slot day-slot-budget" aria-label="Budget" data-slot="budget">
      <div className="day-slot-title-row">
        <h2 className="day-slot-title">Budget</h2>
        <Link to={`/trips/${tripId}/budget`} className="day-budget-more">
          Open Budget ↗
        </Link>
      </div>
      {rollup && hasBudgetData ? (
        <DayRollup rollup={rollup} dayId={day.id} />
      ) : (
        <p className="day-budget-empty meta">Nothing spent or budgeted for this day yet.</p>
      )}
      <button
        type="button"
        className="day-budget-extra-toggle"
        onClick={() => setExtraOpen((o) => !o)}
        aria-expanded={extraOpen}
      >
        {extraOpen ? 'Done' : '+ Add extra to a category'}
      </button>
      {extraOpen && (
        <DayExtraEditor
          tripId={tripId}
          dayId={day.id}
          rollup={rollup}
          onChanged={(line) => (line ? applyOfflineLine(line) : loadRollup())}
        />
      )}
      <FastAddCost
        tripId={tripId}
        dayId={day.id}
        entries={entries}
        onAdded={handleEntryAdded}
        onUpdated={handleEntryUpdated}
        onDeleted={handleEntryDeleted}
      />
    </section>
  )
}

// JournalSlot renders the per-day journal editor (M06.4 S1).
// readOnly is true for past trips so the entry is shown as a permanent record.
function JournalSlot({
  tripId,
  dayId,
  readOnly,
}: {
  tripId: string
  dayId: string
  readOnly: boolean
}) {
  return (
    <section className="day-slot day-slot-journal" aria-label="Journal" data-slot="journal">
      <h2 className="day-slot-title">Journal</h2>
      <JournalEditor tripId={tripId} dayId={dayId} readOnly={readOnly} />
    </section>
  )
}

// MapSlot lazily renders the per-day map. When `day` is not yet loaded the
// placeholder shell is shown; once day data is available DayMap is loaded on
// demand (lazy + Suspense) so the map bundle is not fetched on initial load.
function MapSlot({
  day,
  selectedId,
  onSelect,
}: {
  day: Day | null
  selectedId: string | null
  onSelect: (id: string | null) => void
}) {
  return (
    <section className="day-slot day-slot-map" aria-label="Map" data-slot="map">
      <h2 className="day-slot-title">Map</h2>
      {day ? (
        <Suspense
          fallback={
            <p className="day-map-loading" aria-busy="true">
              Loading map…
            </p>
          }
        >
          <DayMap key={day.id} day={day} selectedId={selectedId} onSelect={onSelect} />
        </Suspense>
      ) : (
        <p className="day-slot-placeholder">Map</p>
      )}
    </section>
  )
}

// FACETS are the four day sections. On phones they are shown one at a time and
// switched with a segmented control (a trip's facets aren't top-level nav
// destinations, so they live here rather than in the bottom bar). On laptop/
// tablet all four render together in the two-column grid.
// The day screen's facets. Plan, "what happened", and Journal fuse into one
// scrollable "Day" facet (streamlined so it doesn't duplicate the whole-trip
// Days tab); Map stays its own facet. Deep budget lives on the Budget tab, with
// a compact strip inside Day.
const FACETS = [
  { key: 'day', label: 'Day' },
  { key: 'map', label: 'Map' },
] as const
type Facet = (typeof FACETS)[number]['key']

// FacetTabs is the mobile segmented control that switches the visible day facet.
function FacetTabs({ value, onChange }: { value: Facet; onChange: (f: Facet) => void }) {
  return (
    <div className="day-facet-tabs" role="tablist" aria-label="Trip sections">
      {FACETS.map((f) => (
        <button
          key={f.key}
          type="button"
          role="tab"
          aria-selected={value === f.key}
          className={['day-facet-tab', value === f.key ? 'day-facet-tab--active' : '']
            .filter(Boolean)
            .join(' ')}
          onClick={() => onChange(f.key)}
        >
          {f.label}
        </button>
      ))}
    </div>
  )
}

// DayView renders a single trip day identified by /trips/:tripId/days/:date.
// It fetches the day from the API, shows its metadata, and renders the planning
// section (stays, timed/untimed items, quick-add, backlog link) plus the Budget,
// Journal, and Map slots. On phones the four are shown one at a time via
// FacetTabs; on wider screens they render together in the two-column grid.
export function DayView() {
  const { tripId, date } = useParams<{ tripId: string; date: string }>()
  const { trip } = useTripShell()
  // A trip is "past" when its end date is before today; journals become read-only.
  const isPast = trip.end_date < new Date().toISOString().slice(0, 10)

  const mobile = useMobile()
  // On phones only one facet shows at a time; `view` tracks which. It lives in
  // component state (not the URL) so it persists as the user flips between days
  // — DayView stays mounted across date changes.
  const [view, setView] = useState<Facet>('day')

  const [day, setDay] = useState<Day | null>(null)
  // planItems is the live source of truth for the day's plan items, lifted out of
  // PlanningSection so the map (MapSlot) reflects adds/edits/removes immediately
  // — without a page reload. Seeded from the fetched day and mutated in place.
  const [planItems, setPlanItems] = useState<PlanItem[]>([])
  // fetchError is scoped to a date so stale errors from a previous date are
  // not shown when the user navigates to a new day (avoids synchronous resets).
  const [fetchError, setFetchError] = useState<{ date: string; msg: string } | null>(null)
  // selectedId holds the currently highlighted entity id, shared between the
  // map pin legend and the planning list (Epic 04 S1).
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Instant-render cache state (M11.1 S2): seededFromCache is true while the day
  // shown came from the on-device cache; revalidating is true while the
  // background fetch runs. Together they drive the subtle "Updating…" hint.
  const [seededFromCache, setSeededFromCache] = useState(false)
  const [revalidating, setRevalidating] = useState(false)

  // Derive loading: we are loading when neither a day result nor an error for
  // the current date param is available yet — no synchronous setState needed.
  const loading = day?.date !== date && fetchError?.date !== date
  const error = fetchError !== null && fetchError.date === date ? fetchError.msg : null

  useEffect(() => {
    if (!tripId || !date) return
    const controller = new AbortController()
    let done = false
    const key = cacheKeys.day(tripId, date)

    // Instant-render: paint the last-known day from cache first (so a backend
    // cold start / weak connection doesn't show a spinner), then revalidate and
    // swap in fresh data. A failed refresh is non-destructive — the cached day
    // stays on screen and no error is shown.
    void readCache<Day>(key).then((cached) => {
      if (done) return
      const hasCache = cached !== null && cached.data.date === date
      if (hasCache) {
        setDay(cached.data)
        setPlanItems(cached.data.plan_items)
        setSeededFromCache(true)
      }
      setRevalidating(true)
      return fetchDay(tripId, date, controller.signal).then(
        (d) => {
          if (done) return
          setDay(d)
          setPlanItems(d.plan_items)
          setSeededFromCache(false)
          setRevalidating(false)
          void writeCache(key, d)
        },
        (err: unknown) => {
          if (done) return
          setRevalidating(false)
          if (err instanceof DOMException && err.name === 'AbortError') return
          if (err instanceof UnauthorizedError) return
          if (!hasCache) setFetchError({ date, msg: 'Could not load day.' })
        },
      )
    })

    return () => {
      done = true
      controller.abort()
    }
  }, [tripId, date])

  // liveDay overlays the live plan items onto the fetched day so the map and the
  // planning list share one source of truth — adding a stop updates both at once.
  const liveDay = day ? { ...day, plan_items: planItems } : null

  // Persist every optimistic day mutation (adds, edits, status changes, stays)
  // to the on-device cache so an offline reload keeps showing them. Without this,
  // a pull-to-refresh while offline would re-render only the last server-synced
  // day and appear to drop everything entered offline — the queued writes are
  // safe in the mutation queue, but the read view wouldn't reflect them until
  // they replayed on reconnect. Syncing here mirrors the fetch-success writeCache
  // above and JournalEditor's offline cache write, and covers all mutation sites
  // at once (they all funnel through `day`/`planItems`). Guard on the date so a
  // stale day mid-navigation never overwrites the cache for the wrong date.
  useEffect(() => {
    if (!tripId || !day || day.date !== date) return
    void writeCache(cacheKeys.day(tripId, date), { ...day, plan_items: planItems })
  }, [tripId, date, day, planItems])

  // setStays updates the fetched day's stays in place so the pinned stay slot
  // and the day map reflect an add/edit/remove without a reload.
  const setStays: React.Dispatch<React.SetStateAction<Stay[]>> = (action) => {
    setDay((cur) =>
      cur
        ? {
            ...cur,
            stays:
              typeof action === 'function'
                ? (action as (prev: Stay[]) => Stay[])(cur.stays)
                : action,
          }
        : cur,
    )
  }

  // day.index is 0-based (server-provided); +1 gives the 1-based display number.
  const dayNumber = day ? day.index + 1 : null

  return (
    <article className="day-view" aria-label={date ? `Day ${dayNumber ?? ''} — ${date}` : 'Day'}>
      <header className="day-view-header">
        <h2 className="day-view-title">
          {dayNumber !== null ? `Day ${dayNumber}` : 'Day'}
          <CacheStatus fromCache={seededFromCache} isValidating={revalidating} />
        </h2>
        {date && (
          <time className="day-view-date" dateTime={date}>
            {fullDate(date)}
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

      {(() => {
        // The four day facets, built once and placed either together (grid) or
        // one at a time (mobile FacetTabs).
        const planningSlot =
          liveDay && tripId ? (
            <PlanningSection
              key={liveDay.id}
              day={liveDay}
              items={planItems}
              setItems={setPlanItems}
              setStays={setStays}
              tripId={tripId}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          ) : (
            <section
              className="day-slot day-slot-planning"
              aria-label="Planning"
              data-slot="planning"
            >
              <h2 className="day-slot-title">Plan</h2>
            </section>
          )
        const budgetStrip =
          day && tripId ? (
            <DayBudgetStrip tripId={tripId} day={day} />
          ) : (
            <section className="day-slot day-slot-budget" aria-label="Budget" data-slot="budget">
              <h2 className="day-slot-title">Budget</h2>
            </section>
          )
        const mapSlot = <MapSlot day={liveDay} selectedId={selectedId} onSelect={setSelectedId} />
        const journalSlot =
          day && tripId ? (
            <JournalSlot tripId={tripId} dayId={day.id} readOnly={isPast} />
          ) : (
            <section className="day-slot day-slot-journal" aria-label="Journal" data-slot="journal">
              <h2 className="day-slot-title">Journal</h2>
            </section>
          )

        // Phones: a segmented control switches between the Day scroll (plan +
        // what happened + journal + a compact budget strip) and the Map.
        if (mobile) {
          return (
            <div className="day-facets">
              <FacetTabs value={view} onChange={setView} />
              <div className="day-facet-panel">
                {view === 'day' && (
                  <>
                    {planningSlot}
                    {journalSlot}
                    {budgetStrip}
                  </>
                )}
                {view === 'map' && mapSlot}
              </div>
            </div>
          )
        }

        // Laptop/tablet: two columns — the merged Day (plan + what happened +
        // journal) on the left, the map with the compact budget strip on the right.
        return (
          <div className="day-grid">
            <div className="day-grid-col day-grid-left">
              {planningSlot}
              {journalSlot}
            </div>
            <div className="day-grid-col day-grid-right">
              {mapSlot}
              {budgetStrip}
            </div>
          </div>
        )
      })()}
    </article>
  )
}
