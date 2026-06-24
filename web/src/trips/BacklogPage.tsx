import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  PlanItemValidationError,
  UnauthorizedError,
  createPlanItem,
  fetchBacklog,
  type PlanItem,
  type PlanItemInput,
} from '../lib/api'

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

// BacklogPage lists the ideas backlog for a trip — plan items with no assigned
// day. Accessible from the day view via the backlog link (M04.5 S1 AC3).
// Quick-add is available inline (M04.5 S2 AC4).
export function BacklogPage() {
  const { tripId } = useParams<{ tripId: string }>()
  const navigate = useNavigate()

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
            <li key={item.id} className="backlog-item">
              <span className="backlog-item-title">{item.title}</span>
              {item.type && <span className="backlog-item-type">{item.type}</span>}
              {item.location && <span className="backlog-item-location">{item.location}</span>}
            </li>
          ))}
        </ul>
      )}

      {tripId && <BacklogQuickAdd tripId={tripId} onAdded={handleAdded} />}
    </section>
  )
}
