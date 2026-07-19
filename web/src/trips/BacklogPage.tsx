import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  PlanItemValidationError,
  UnauthorizedError,
  createPlanItem,
  datesInRange,
  deletePlanItem,
  fetchBacklog,
  fetchDay,
  promotePlanItem,
  updatePlanItem,
  type PlanItem,
} from '../lib/api'
import { enqueue } from '../lib/mutationQueue'
import { useIsOnline } from '../lib/useIsOnline'
import { splitAmount } from './splitAmount'
import { BottomSheet, PlanItemForm, QuickAddForm } from './PlanItemForm'
import {
  fieldsFromItem,
  fieldsToInput,
  mergeInput,
  tempPlanItem,
  useMobile,
  type PlanItemFormFields,
} from './planItemForm.helpers'
import { useTripShell } from './useTripShell'

// PromotePicker is the inline day-picker shown when the user clicks "Promote…"
// on a backlog item. It resolves the selected date to a day UUID and calls
// promotePlanItem, then removes the item from the backlog list.
function PromotePicker({
  tripId,
  item,
  tripDates,
  onPromoted,
  onCancel,
}: {
  tripId: string
  item: PlanItem
  tripDates: string[]
  onPromoted: (itemId: string) => void
  onCancel: () => void
}) {
  const [selectedDate, setSelectedDate] = useState(tripDates[0] ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handlePromote() {
    if (!selectedDate) return
    setBusy(true)
    setError(null)
    try {
      const targetDay = await fetchDay(tripId, selectedDate)
      await promotePlanItem(tripId, item.id, targetDay.id)
      onPromoted(item.id)
    } catch {
      setError('Could not promote item.')
    } finally {
      setBusy(false)
    }
  }

  if (tripDates.length === 0) {
    return (
      <span className="backlog-promote-picker">
        <span className="backlog-promote-picker-empty">No days in trip.</span>
        <button type="button" className="backlog-promote-cancel" onClick={onCancel}>
          Cancel
        </button>
      </span>
    )
  }

  return (
    <span className="backlog-promote-picker">
      <select
        className="backlog-promote-select"
        value={selectedDate}
        onChange={(e) => setSelectedDate(e.target.value)}
        disabled={busy}
        aria-label="Target day"
      >
        {tripDates.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="backlog-promote-confirm"
        onClick={handlePromote}
        disabled={busy || !selectedDate}
      >
        Add to day
      </button>
      <button type="button" className="backlog-promote-cancel" onClick={onCancel} disabled={busy}>
        Cancel
      </button>
      {error && (
        <span role="alert" className="backlog-promote-error">
          {error}
        </span>
      )}
    </span>
  )
}

// BacklogItem renders a single backlog item. Tapping it opens the same
// full-detail edit form the day view uses (inline on desktop, a bottom sheet on
// mobile), so an idea can be refined in place — title, kind, place, time, cost,
// notes — exactly like a planned item. Promote-to-day and delete sit below;
// delete is gated behind a second click so a stray tap can't lose an idea.
function BacklogItem({
  item,
  tripId,
  tripDates,
  onPromoted,
  onUpdated,
  onAdded,
  onDeleted,
}: {
  item: PlanItem
  tripId: string
  tripDates: string[]
  onPromoted: (itemId: string) => void
  onUpdated: (updated: PlanItem) => void
  // onAdded appends a newly created sibling (used when a split turns one idea
  // into several parts on save), mirroring the day view.
  onAdded: (item: PlanItem) => void
  onDeleted: (itemId: string) => void
}) {
  const mobile = useMobile()
  const online = useIsOnline()
  const [editing, setEditing] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [showPicker, setShowPicker] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)

  async function handleDelete() {
    setDeleteBusy(true)
    try {
      await deletePlanItem(tripId, item.id)
      onDeleted(item.id)
    } catch {
      setDeleteBusy(false)
      setConfirmDelete(false)
    }
  }

  // A backlog idea carries no day, so edits keep day_id null. This mirrors the
  // day view's PlanItemRow save — including split-into-parts and the offline
  // queue — so editing an idea behaves exactly like editing a planned item.
  async function handleSave(fields: PlanItemFormFields, splitParts: number) {
    setEditError(null)
    const base = fieldsToInput(fields, null)
    try {
      if (splitParts > 1 && base.cost != null && base.cost > 0) {
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
          await enqueue('updatePlanItem', { tripId, itemId: item.id, input: firstInput })
          onUpdated(mergeInput(item, tripId, firstInput))
          for (const input of partInputs) {
            const withId = { ...input, id: crypto.randomUUID() }
            await enqueue('createPlanItem', { tripId, input: withId })
            onAdded(tempPlanItem(tripId, null, withId))
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
      if (err instanceof PlanItemValidationError) setEditError(err.message)
      else setEditError('Could not save changes.')
    }
  }

  async function handleAutoSave(fields: PlanItemFormFields) {
    const input = fieldsToInput(fields, null)
    if (!online) {
      await enqueue('updatePlanItem', { tripId, itemId: item.id, input })
      onUpdated(mergeInput(item, tripId, input))
      return
    }
    const updated = await updatePlanItem(tripId, item.id, input)
    onUpdated(updated)
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
        {/* Keep the row visible behind the sheet (mirrors the day view). */}
        <li className="plan-item backlog-item" aria-label={item.title}>
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
    return <li className="plan-item backlog-item plan-item--editing">{editForm}</li>
  }

  return (
    <li className="plan-item backlog-item">
      <div className="plan-item-main">
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
          <span className="plan-item-title">{item.title}</span>
          {item.location && <span className="plan-item-location">{item.location}</span>}
          {item.note && <span className="plan-item-note">{item.note}</span>}
        </button>
      </div>
      <div className="backlog-item-actions">
        {showPicker ? (
          <PromotePicker
            tripId={tripId}
            item={item}
            tripDates={tripDates}
            onPromoted={(id) => {
              setShowPicker(false)
              onPromoted(id)
            }}
            onCancel={() => setShowPicker(false)}
          />
        ) : (
          <>
            <button
              type="button"
              className="backlog-promote-btn"
              onClick={() => setShowPicker(true)}
              aria-label={`Promote ${item.title} to a day`}
            >
              Promote…
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

// BacklogPage lists the ideas backlog for a trip — plan items with no assigned
// day. Accessible from the day view via the backlog link (M04.5 S1 AC3).
// Quick-add is available inline (M04.5 S2 AC4). Promote-to-day is wired to
// Epic 03 S2 (M04.5 S3 AC3).
export function BacklogPage() {
  const { tripId } = useParams<{ tripId: string }>()
  const navigate = useNavigate()
  const { trip } = useTripShell()
  const tripDates = datesInRange(trip.start_date, trip.end_date)

  const [items, setItems] = useState<PlanItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!tripId) return
    const controller = new AbortController()

    fetchBacklog(tripId, controller.signal)
      .then((data) => setItems(data))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        if (err instanceof UnauthorizedError) return
        setError('Could not load backlog.')
      })

    return () => controller.abort()
  }, [tripId])

  const loading = items === null && error === null

  function handleAdded(item: PlanItem) {
    setItems((prev) => (prev ? [...prev, item] : [item]))
  }

  function handleUpdated(updated: PlanItem) {
    setItems((prev) => (prev ? prev.map((i) => (i.id === updated.id ? updated : i)) : prev))
  }

  function handlePromoted(itemId: string) {
    setItems((prev) => (prev ? prev.filter((i) => i.id !== itemId) : prev))
  }

  function handleDeleted(itemId: string) {
    setItems((prev) => (prev ? prev.filter((i) => i.id !== itemId) : prev))
  }

  return (
    <section className="backlog-page" aria-label="Ideas backlog">
      <div className="screen-content backlog-body">
        <header className="backlog-head">
          <button className="backlog-back" aria-label="Back to plan" onClick={() => navigate(-1)}>
            ← Back
          </button>
          <h1 className="h1">💡 Ideas backlog</h1>
          <p className="meta">
            Park ideas that aren’t tied to a day yet — promote one to a day when you’re ready.
          </p>
        </header>

        {loading && (
          <p className="backlog-loading" aria-busy="true">
            Loading ideas…
          </p>
        )}
        {error && (
          <p role="alert" className="backlog-error">
            {error}
          </p>
        )}
        {items !== null && items.length === 0 && (
          <p className="backlog-empty">No ideas yet. Add your first one.</p>
        )}
        {items !== null && items.length > 0 && (
          <ul className="backlog-list">
            {items.map((item) => (
              <BacklogItem
                key={item.id}
                item={item}
                tripId={tripId!}
                tripDates={tripDates}
                onPromoted={handlePromoted}
                onUpdated={handleUpdated}
                onAdded={handleAdded}
                onDeleted={handleDeleted}
              />
            ))}
          </ul>
        )}

        {tripId && (
          <div className="backlog-add">
            {/* The same full-detail add form as a day, with no day assigned —
                so an idea can carry a place, time, cost and notes from the
                start and promote straight onto a day later. (M04.5) */}
            <QuickAddForm tripId={tripId} dayId={null} onAdded={handleAdded} />
          </div>
        )}
      </div>
    </section>
  )
}
