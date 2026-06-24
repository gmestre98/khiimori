import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { UnauthorizedError, fetchBacklog, type PlanItem } from '../lib/api'

// BacklogPage lists the ideas backlog for a trip — plan items with no assigned
// day. Accessible from the day view via the backlog link (M04.5 S1 AC3).
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
      {items !== null && items.length === 0 && (
        <p className="backlog-empty">No ideas yet. Add items from the day view.</p>
      )}
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
    </section>
  )
}
