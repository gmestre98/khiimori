import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
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
import { Icon } from '../components/ui/Icon'

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
        {tripDates.map((d, i) => (
          <option key={d} value={d}>
            {new Date(d + 'T00:00:00').toLocaleDateString('en-GB', {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
            })}{' '}
            · Day {i + 1}
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

  const cost = item.cost != null && item.cost > 0 ? `€${Math.round(item.cost)}` : ''
  const where =
    (item.kind ?? 'activity') === 'transport'
      ? [item.origin, item.destination].filter(Boolean).join(' → ')
      : (item.location ?? '')
  return (
    <li className="backlog-idea">
      <div className="backlog-idea-head">
        <button
          type="button"
          className="backlog-idea-name"
          aria-label={`Edit ${item.title}`}
          onClick={() => setEditing(true)}
        >
          {item.title}
        </button>
        {(cost || item.start_time) && (
          <span className="backlog-idea-cost">
            {[item.start_time?.slice(0, 5), cost].filter(Boolean).join(' · ')}
          </span>
        )}
      </div>
      {where && <span className="backlog-idea-where">{where}</span>}
      {item.note && <span className="backlog-idea-why">{item.note}</span>}
      <div className="backlog-idea-actions">
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
        ) : confirmDelete ? (
          <span className="backlog-confirm">
            <span>Delete this idea?</span>
            <button
              type="button"
              className="fg-btn fg-btn--danger"
              onClick={handleDelete}
              disabled={deleteBusy}
              aria-label={`Confirm delete ${item.title}`}
            >
              Delete
            </button>
            <button
              type="button"
              className="fg-btn fg-btn--quiet"
              onClick={() => setConfirmDelete(false)}
              disabled={deleteBusy}
              aria-label="Cancel delete"
            >
              Keep
            </button>
          </span>
        ) : (
          <>
            <button
              type="button"
              className="fg-icon-btn backlog-delete"
              onClick={() => setConfirmDelete(true)}
              aria-label={`Delete ${item.title}`}
            >
              <Icon name="trash" size={16} />
            </button>
            <button
              type="button"
              className="fg-btn fg-btn--quiet"
              onClick={() => setShowPicker(true)}
              aria-label={`Add ${item.title} to a day`}
            >
              Add to a day
            </button>
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
    <section className="fg-screen backlog-page" aria-label="Ideas backlog">
      <header className="backlog-head">
        <Link to={`/trips/${trip.id}/plan`} state={{ trip }} className="fg-back backlog-back">
          <Icon name="back" size={18} />
          All days
        </Link>
        <h1 className="fg-page-title">Backlog</h1>
        <p className="backlog-intro">
          Ideas that aren’t on a day yet. Move one onto a day when you’re ready.
        </p>
        {tripId && (
          <div className="backlog-add">
            {/* The same full-detail add form as a day, with no day assigned —
                so an idea can carry a place, time, cost and notes from the
                start and go straight onto a day later. (M04.5) */}
            <QuickAddForm
              tripId={tripId}
              dayId={null}
              onAdded={handleAdded}
              variant="bar"
              placeholder="Add an idea…"
              titleLabel="New idea"
            />
          </div>
        )}
      </header>

      {loading && (
        <p className="fg-loading backlog-loading" aria-busy="true">
          Loading ideas…
        </p>
      )}
      {error && (
        <p role="alert" className="fg-error backlog-error">
          {error}
        </p>
      )}
      {items !== null && items.length === 0 && (
        <p className="fg-empty backlog-empty">No ideas yet. Add your first one.</p>
      )}
      {items !== null && items.length > 0 && (
        <section className="backlog-group" aria-label="Ideas">
          <div className="backlog-group-head">
            <h2 className="backlog-group-title">Ideas</h2>
            <span className="fg-meta">
              {items.length} {items.length === 1 ? 'idea' : 'ideas'}
            </span>
          </div>
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
        </section>
      )}
    </section>
  )
}
