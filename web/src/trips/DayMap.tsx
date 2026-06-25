import { useEffect, useRef, useState } from 'react'
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

// DayMap fetches route waypoints for the day and renders the static map image.
// Locations are collected from the day's stays and plan items (in itinerary
// order). Items without a location are silently excluded by the geo proxy.
// Exported as the default so React.lazy can load it on demand.
export default function DayMap({ day }: { day: Day }) {
  const [waypoints, setWaypoints] = useState<LatLng[] | null>(null)
  const [error, setError] = useState(false)

  // Collect ordered location strings: stay first (check-in), then plan items
  // sorted by sort_order. Empty/missing locations are passed through — the
  // server skips them when geocoding.
  const locations = [
    ...(day.stays ?? []).map((s) => s.location ?? ''),
    ...[...(day.plan_items ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((i) => i.location ?? ''),
  ]

  const hasAnyLocation = locations.some((l) => l !== '')

  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!hasAnyLocation) {
      // Schedule to avoid setState-in-effect lint error
      const t = setTimeout(() => setWaypoints([]), 0)
      return () => clearTimeout(t)
    }

    const controller = new AbortController()
    abortRef.current = controller

    fetchDayRoute(locations, controller.signal)
      .then((res) => setWaypoints(res.waypoints))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        if (err instanceof UnauthorizedError) return
        setError(true)
      })

    return () => controller.abort()
    // locations array identity changes on every render — compare by value via join
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day.id, locations.join('|')])

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
    <DayMapImage
      waypoints={waypoints}
      label={`Map for ${day.date}`}
    />
  )
}
