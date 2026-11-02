import { useState } from 'react'
import { TripPackingPage } from './TripPackingPage'

type PrepTab = 'todos' | 'packing'

// TripPrepPage is the trip's Prep tab (/trips/:id/packing): a To-dos | Packing
// switch over the existing packing list. To-dos have no backend yet, so that
// tab is an honest "coming soon" state — nothing is faked or stored locally.
export function TripPrepPage() {
  const [tab, setTab] = useState<PrepTab>('packing')
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
        <div className="fg-empty prep-todos-empty" role="status">
          <strong>To-dos are coming soon.</strong> Visa checks, bookings to confirm and copies to
          print will live here, with deadlines. For now, keep them as notes on the day they matter.
        </div>
      ) : (
        <TripPackingPage embedded />
      )}
    </section>
  )
}
