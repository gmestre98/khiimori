import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { TripPackingPage } from './TripPackingPage'
import { TripTodos } from './TripTodos'

type PrepTab = 'todos' | 'packing'

// TripPrepPage is the trip's Prep tab (/trips/:id/packing): a To-dos | Packing
// switch. To-dos are the things to sort out for the trip, with optional
// deadlines; Packing is the packing list with its templates.
export function TripPrepPage() {
  const { tripId } = useParams<{ tripId: string }>()
  const [tab, setTab] = useState<PrepTab>('todos')
  return (
    <section className="fg-screen prep-page" aria-labelledby="prep-title">
      <h1 id="prep-title" className="fg-page-title">
        Prep
      </h1>
      <div className="seg seg--block" role="group" aria-label="Prep lists">
        <button
          type="button"
          className="seg-btn"
          aria-pressed={tab === 'todos'}
          onClick={() => setTab('todos')}
        >
          To-dos
        </button>
        <button
          type="button"
          className="seg-btn"
          aria-pressed={tab === 'packing'}
          onClick={() => setTab('packing')}
        >
          Packing
        </button>
      </div>
      {tab === 'todos' ? (
        tripId ? (
          <TripTodos tripId={tripId} />
        ) : null
      ) : (
        <TripPackingPage embedded />
      )}
    </section>
  )
}
