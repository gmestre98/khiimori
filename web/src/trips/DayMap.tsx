import { useEffect, useState } from 'react'
import { fetchDayRoute, staticMapUrl, UnauthorizedError, type Day, type LatLng } from '../lib/api'
import { collectLocatedItems } from './locatedItems'

// collectLocations builds the raw location string list passed to fetchDayRoute,
// including empty strings for location-less items (the server skips them).
function collectLocations(day: Day): string[] {
  return [
    ...(day.stays ?? []).map((s) => s.location ?? ''),
    ...[...(day.plan_items ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((i) => i.location ?? ''),
  ]
}

// DayMapImage renders the static map <img> once waypoints are resolved.
function DayMapImage({ waypoints, label }: { waypoints: LatLng[]; label: string }) {
  const url = staticMapUrl(waypoints, { size: '600x300', scale: 2 })
  if (!url) return null
  return <img src={url} alt={label} className="day-map-img" width={600} height={300} />
}

// DayMap fetches route waypoints for the day and renders the static map image.
// Items without a location are silently excluded by the geo proxy.
// Exported as the default so React.lazy can load it on demand.
//
// selectedId / onSelect wire the shared selection state (Epic 04 S1): clicking
// a pin in the legend updates selectedId; PlanningSection highlights the item.
export default function DayMap({
  day,
  selectedId,
  onSelect,
}: {
  day: Day
  selectedId: string | null
  onSelect: (id: string | null) => void
}) {
  const locations = collectLocations(day)
  const locatedItems = collectLocatedItems(day)
  const hasAnyLocation = locations.some((l) => l !== '')

  // When no item has a location we know immediately the map is empty — skip the
  // async fetch and start in the "resolved empty" state.
  const [waypoints, setWaypoints] = useState<LatLng[] | null>(hasAnyLocation ? null : [])
  const [error, setError] = useState(false)

  // Stable key for the effect: re-run when the day or its location strings change.
  const locKey = `${day.id}:${locations.join('|')}`

  useEffect(() => {
    if (!hasAnyLocation) return

    const controller = new AbortController()

    fetchDayRoute(locations, controller.signal)
      .then((res) => setWaypoints(res.waypoints))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        if (err instanceof UnauthorizedError) return
        setError(true)
      })

    return () => controller.abort()
    // locKey encodes day.id + all locations as a single stable primitive
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locKey])

  if (error) {
    return <p className="day-map-error">Map unavailable.</p>
  }

  if (waypoints === null) {
    return (
      <p className="day-map-loading" aria-busy="true">
        Loading map…
      </p>
    )
  }

  if (waypoints.length === 0) {
    return <p className="day-map-empty">No located stops for this day.</p>
  }

  return (
    <div className="day-map-container">
      <DayMapImage waypoints={waypoints} label={`Map for ${day.date}`} />
      {locatedItems.length > 0 && (
        <nav className="day-map-pins" aria-label="Map pins">
          {locatedItems.map((item, i) => (
            <button
              key={item.id}
              type="button"
              className={['day-map-pin', selectedId === item.id ? 'day-map-pin--selected' : '']
                .filter(Boolean)
                .join(' ')}
              aria-label={`Pin ${i + 1}: ${item.label}`}
              aria-pressed={selectedId === item.id}
              onClick={() => onSelect(selectedId === item.id ? null : item.id)}
            >
              {i + 1}
            </button>
          ))}
        </nav>
      )}
    </div>
  )
}
