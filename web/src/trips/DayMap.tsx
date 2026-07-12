import { useEffect, useMemo, useState } from 'react'
import L from 'leaflet'
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { fetchDayRoute, UnauthorizedError, type Day, type LatLng } from '../lib/api'
import { collectLocatedItems, type LocatedItem } from './locatedItems'

// collectLocations builds the raw location string list passed to fetchDayRoute,
// including empty strings for location-less items (the server skips them). The
// order matches collectLocatedItems so returned waypoints line up positionally
// with located items (waypoints[i] ↔ locatedItems[i]).
function collectLocations(day: Day): string[] {
  return [
    ...(day.stays ?? []).map((s) => s.location ?? ''),
    ...[...(day.plan_items ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((i) => i.location ?? ''),
  ]
}

// DEFAULT_CENTER / DEFAULT_ZOOM frame a gentle world view when the day has no
// located stops yet — the map stays visible ("always available") rather than
// being replaced by an empty-state message.
const DEFAULT_CENTER: [number, number] = [20, 0]
const DEFAULT_ZOOM = 2

// accentColor reads the design system's --accent token so the route polyline and
// markers stay in sync with the theme instead of hard-coding a hex value.
function accentColor(): string {
  if (typeof window === 'undefined') return '#2f6f6a'
  const v = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()
  return v || '#2f6f6a'
}

// pinIcon builds a numbered Leaflet divIcon styled to match the itinerary pins.
// Selected pins get a modifier class so the map highlight mirrors the list; pins
// for things that didn't happen (not done) fade back so they read apart from the
// ones that did.
function pinIcon(n: number, selected: boolean, done: boolean): L.DivIcon {
  const cls = [
    'day-map-marker',
    selected ? 'day-map-marker--selected' : '',
    // A selected pin is never faint — clicking it emphasises it.
    !done && !selected ? 'day-map-marker--faint' : '',
  ]
    .filter(Boolean)
    .join(' ')
  return L.divIcon({
    className: 'day-map-marker-wrap',
    html: `<span class="${cls}">${n}</span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  })
}

// MapController syncs the imperative Leaflet map with React state: it fits the
// view to the day's waypoints and pans to the selected pin when it changes.
function MapController({
  waypoints,
  selectedIndex,
}: {
  waypoints: LatLng[]
  selectedIndex: number
}) {
  const map = useMap()

  useEffect(() => {
    if (waypoints.length === 0) {
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM)
      return
    }
    if (waypoints.length === 1) {
      map.setView([waypoints[0].lat, waypoints[0].lng], 14)
      return
    }
    const bounds = L.latLngBounds(waypoints.map((w) => [w.lat, w.lng] as [number, number]))
    map.fitBounds(bounds, { padding: [32, 32] })
  }, [map, waypoints])

  useEffect(() => {
    if (selectedIndex < 0 || selectedIndex >= waypoints.length) return
    const wp = waypoints[selectedIndex]
    map.panTo([wp.lat, wp.lng])
  }, [map, selectedIndex, waypoints])

  return null
}

// DayMap renders an interactive OpenStreetMap view of the day's located stops.
// The map is always shown so users can orient themselves even before adding a
// location; markers are clickable and wired to the shared selection state
// (Epic 04 S1), so clicking a pin on the map highlights the matching list item.
//
// Items without a location are excluded (the geo proxy skips empty strings).
// Exported as the default so React.lazy can load the map bundle on demand.
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

  // Skip the async fetch when nothing has a location: start "resolved empty".
  const [waypoints, setWaypoints] = useState<LatLng[] | null>(hasAnyLocation ? null : [])
  const [error, setError] = useState(false)

  const locKey = `${day.id}:${locations.join('|')}`

  useEffect(() => {
    // Nothing to geocode: no fetch, no state churn. State is only ever written
    // from the async callbacks below, so the effect never setState synchronously.
    if (!hasAnyLocation) return
    const controller = new AbortController()
    fetchDayRoute(locations, controller.signal)
      .then((res) => {
        if (controller.signal.aborted) return
        setWaypoints(res.waypoints)
        setError(false)
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        if (err instanceof UnauthorizedError) return
        setError(true)
        setWaypoints([])
      })
    return () => controller.abort()
    // locKey encodes day.id + all locations as a single stable primitive
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locKey])

  // Derive displayed points from hasAnyLocation so clearing the last location
  // immediately empties the map without needing to reset fetched state.
  const points = hasAnyLocation ? (waypoints ?? []) : []
  const selectedIndex = useMemo(
    () => (selectedId ? locatedItems.findIndex((it) => it.id === selectedId) : -1),
    [selectedId, locatedItems],
  )
  const routeColor = useMemo(() => accentColor(), [])

  // Caption below the map communicates state without hiding the map itself.
  let caption: string | null = null
  if (!hasAnyLocation) {
    caption = 'No places yet. Add a location to a stay or activity and its pin appears here.'
  } else if (error) {
    caption = 'Couldn’t load stop positions right now. The map is still available above.'
  } else if (waypoints === null) {
    caption = 'Loading stops…'
  } else if (points.length === 0) {
    caption =
      'We couldn’t place any of this day’s locations. Try adding a city or country to each one.'
  }

  return (
    <div className="day-map">
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        scrollWheelZoom={false}
        className="day-map-leaflet"
        aria-label={`Map for ${day.date}`}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {points.length > 1 && (
          <Polyline
            positions={points.map((w) => [w.lat, w.lng] as [number, number])}
            pathOptions={{ color: routeColor, weight: 3, opacity: 0.5 }}
          />
        )}
        {points.map((wp, i) => {
          const item: LocatedItem | undefined = locatedItems[i]
          const isSelected = !!item && selectedId === item.id
          return (
            <Marker
              key={item?.id ?? `${wp.lat},${wp.lng}`}
              position={[wp.lat, wp.lng]}
              icon={pinIcon(i + 1, isSelected, item?.done ?? true)}
              eventHandlers={{
                click: () => item && onSelect(selectedId === item.id ? null : item.id),
              }}
            >
              {item && <Tooltip>{item.label}</Tooltip>}
            </Marker>
          )
        })}
        <MapController waypoints={points} selectedIndex={selectedIndex} />
      </MapContainer>

      {caption && <p className="day-map-caption">{caption}</p>}

      {locatedItems.length > 0 && (
        <nav className="day-map-pins" aria-label="Map pins">
          {locatedItems.map((item, i) => (
            <button
              key={item.id}
              type="button"
              className={[
                'day-map-pin',
                selectedId === item.id ? 'day-map-pin--selected' : '',
                item.done ? '' : 'day-map-pin--faint',
              ]
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
