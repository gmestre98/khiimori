import { useEffect, useState } from 'react'
import { fetchDayRoute, staticMapUrl, UnauthorizedError, type Day, type LatLng } from '../lib/api'

// DayMapImage renders the static map <img> once waypoints are resolved.
function DayMapImage({
  waypoints,
  label,
}: {
  waypoints: LatLng[]
  label: string
}) {
  const url = staticMapUrl(waypoints, { size: '600x300', scale: 2 })
  if (!url) return null
  return (
    <img
      src={url}
      alt={label}
      className="day-map-img"
      width={600}
      height={300}
    />
  )
}

// Builds an ordered list of location strings from a day: stay first, then plan
// items sorted by sort_order. Empty strings are included — the server skips
// them when geocoding (Epic 02 S3).
function collectLocations(day: Day): string[] {
  return [
    ...(day.stays ?? []).map((s) => s.location ?? ''),
    ...[...(day.plan_items ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((i) => i.location ?? ''),
  ]
}

// DayMap fetches route waypoints for the day and renders the static map image.
// Items without a location are silently excluded by the geo proxy.
// Exported as the default so React.lazy can load it on demand.
export default function DayMap({ day }: { day: Day }) {
  const locations = collectLocations(day)
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

  return <DayMapImage waypoints={waypoints} label={`Map for ${day.date}`} />
}
