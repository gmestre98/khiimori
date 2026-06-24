import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  PlanItemValidationError,
  UnauthorizedError,
  createPlanItem,
  datesInRange,
  fetchBacklog,
  fetchDay,
  promotePlanItem,
  type PlanItem,
  type PlanItemInput,
} from '../lib/api'
import { useTripShell } from './useTripShell'

// BacklogQuickAdd is the inline add form for the backlog. It creates a plan
// item with no day assigned (backlog).
function BacklogQuickAdd({
  tripId,
  onAdded,
}: {
  tripId: string
  onAdded: (item: PlanItem) => void
}) {
  const [title, setTitle] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const t = title.trim()
    if (!t) return
    setSubmitting(true)
    setError(null)
    try {
      const input: PlanItemInput = { title: t, day_id: null }
      const item = await createPlanItem(tripId, input)
      onAdded(item)
      setTitle('')
      inputRef.current?.focus()
    } catch (err) {
      if (err instanceof PlanItemValidationError) {
        setError(err.message)
      } else {
        setError('Could not add idea.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="backlog-quick-add" onSubmit={handleSubmit} aria-label="Add idea">
      <div className="backlog-quick-add-row">
        <input
          ref={inputRef}
          className="backlog-quick-add-input"
          type="text"
          placeholder="Add idea…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          aria-label="Idea title"
          disabled={submitting}
        />
        <button
          type="submit"
          className="backlog-quick-add-submit"
          disabled={submitting || !title.trim()}
          aria-label="Add idea"
        >
          Add
        </button>
      </div>
      {error && (
        <p role="alert" className="backlog-quick-add-error">
          {error}
        </p>
      )}
    </form>
  )
}

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

// BacklogItem renders a single backlog item with a promote-to-day affordance.
function BacklogItem({
  item,
  tripId,
  tripDates,
  onPromoted,
}: {
  item: PlanItem
  tripId: string
  tripDates: string[]
  onPromoted: (itemId: string) => void
}) {
  const [showPicker, setShowPicker] = useState(false)

  return (
    <li className="backlog-item">
      <div className="backlog-item-main">
        <span className="backlog-item-title">{item.title}</span>
        {item.type && <span className="backlog-item-type">{item.type}</span>}
        {item.location && <span className="backlog-item-location">{item.location}</span>}
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
          <button
            type="button"
            className="backlog-promote-btn"
            onClick={() => setShowPicker(true)}
            aria-label={`Promote ${item.title} to a day`}
          >
            Promote…
          </button>
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

  function handlePromoted(itemId: string) {
    setItems((prev) => (prev ? prev.filter((i) => i.id !== itemId) : prev))
  }

  return (
    <section className="backlog-page" aria-label="Ideas backlog">
      <header className="backlog-header">
        <button className="backlog-back" aria-label="Back to day" onClick={() => navigate(-1)}>
          ← Back
        </button>
        <h2 className="backlog-title">Ideas backlog</h2>
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
      {items !== null && items.length === 0 && <p className="backlog-empty">No ideas yet.</p>}
      {items !== null && items.length > 0 && (
        <ul className="backlog-list">
          {items.map((item) => (
            <BacklogItem
              key={item.id}
              item={item}
              tripId={tripId!}
              tripDates={tripDates}
              onPromoted={handlePromoted}
            />
          ))}
        </ul>
      )}

      {tripId && <BacklogQuickAdd tripId={tripId} onAdded={handleAdded} />}
    </section>
  )
}
