import { Fragment, useEffect, useMemo, useState } from 'react'
import L from 'leaflet'
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { UnauthorizedError, type Day, type LatLng } from '../lib/api'
import { loadDayWaypoints } from '../lib/dayRouteCache'
import { localToday } from '../lib/format'
import {
  buildFeatures,
  collectLocatedItems,
  collectLocations,
  featureList,
  type ItemOrder,
} from './locatedItems'

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

// endpointIcon builds the small dot dropped on a transport leg's start and
// finish. The number lives on the leg's ball at the arrow midpoint, so the ends
// are unlabelled markers that just show where the leg begins and lands.
function endpointIcon(selected: boolean, done: boolean): L.DivIcon {
  const cls = [
    'day-map-endpoint',
    selected ? 'day-map-endpoint--selected' : '',
    !done && !selected ? 'day-map-endpoint--faint' : '',
  ]
    .filter(Boolean)
    .join(' ')
  return L.divIcon({
    className: 'day-map-marker-wrap',
    html: `<span class="${cls}"></span>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  })
}

// MapController syncs the imperative Leaflet map with React state: it fits the
// view to the day's waypoints and pans to the selected feature when it changes.
function MapController({
  waypoints,
  selectedAnchor,
}: {
  waypoints: LatLng[]
  selectedAnchor: LatLng | null
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
    if (!selectedAnchor) return
    map.panTo([selectedAnchor.lat, selectedAnchor.lng])
  }, [map, selectedAnchor])

  return null
}

// DayMap renders an interactive OpenStreetMap view of the day's located stops.
// The map is always shown so users can orient themselves even before adding a
// location; markers are clickable and wired to the shared selection state
// (Epic 04 S1), so clicking a pin on the map highlights the matching list item.
//
// A transport leg shows both its ends — a small marker on the start and finish —
// joined by the route line, with the leg's single numbered ball sitting on the
// arrow midpoint. Items without a location are excluded (the geo proxy skips
// empty strings). Exported as the default so React.lazy can load the map bundle
// on demand.
export default function DayMap({
  day,
  selectedId,
  onSelect,
}: {
  day: Day
  selectedId: string | null
  onSelect: (id: string | null) => void
}) {
  // A past day's route reads in the order things actually happened (actual_order);
  // today or a future day still reads in planned order (sort_order).
  const order: ItemOrder = day.date < localToday() ? 'actual' : 'plan'
  const locatedItems = useMemo(() => collectLocatedItems(day, order), [day, order])
  const locations = useMemo(() => collectLocations(day, order), [day, order])
  const hasAnyLocation = locations.length > 0

  // Skip the async fetch when nothing has a location: start "resolved empty".
  // Waypoints are positional (aligned with locatedItems) and may hold a hole for
  // a stop we can't place — `null` from the batched route (e.g. a stop the server
  // couldn't geocode), or `undefined` from the offline geocode-cache fallback.
  const [waypoints, setWaypoints] = useState<(LatLng | null | undefined)[] | null>(
    hasAnyLocation ? null : [],
  )
  const [error, setError] = useState(false)

  const locKey = `${day.id}:${locations.join('|')}`

  useEffect(() => {
    // Nothing to geocode: no fetch, no state churn. State is only ever written
    // from the async callbacks below, so the effect never setState synchronously.
    if (!hasAnyLocation) return
    const controller = new AbortController()
    // Network-first with an offline fallback: cached route when the stops are
    // unchanged, otherwise per-stop coords from the geocode cache (dayRouteCache),
    // so a place added offline still pins if we know where it is.
    loadDayWaypoints(day.trip_id, day.date, locations, controller.signal)
      .then((res) => {
        if (controller.signal.aborted) return
        setWaypoints(res)
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
  // `positioned` keeps its index alignment with locatedItems (holes and all) for
  // pin numbering; `points` is the hole-free subset used to draw the route and
  // fit the map bounds (indexing those with `undefined` would throw).
  const positioned = useMemo(
    () => (hasAnyLocation ? (waypoints ?? []) : []),
    [hasAnyLocation, waypoints],
  )
  // Skipped stops are hidden by default behind a toggle. hasSkipped decides
  // whether the toggle is worth showing at all.
  const [showSkipped, setShowSkipped] = useState(false)
  const hasSkipped = useMemo(() => locatedItems.some((it) => it.skipped), [locatedItems])
  // Filter located items and their waypoints together so the two stay
  // positionally aligned (buildFeatures pairs them by index). When skipped stops
  // are hidden, drop them from both lists before deriving anything drawable.
  const { visibleItems, visiblePositioned } = useMemo(() => {
    if (showSkipped) return { visibleItems: locatedItems, visiblePositioned: positioned }
    const items: typeof locatedItems = []
    const wps: typeof positioned = []
    locatedItems.forEach((it, i) => {
      if (it.skipped) return
      items.push(it)
      wps.push(positioned[i])
    })
    return { visibleItems: items, visiblePositioned: wps }
  }, [locatedItems, positioned, showSkipped])
  const points = useMemo(
    () => visiblePositioned.filter((w): w is LatLng => Boolean(w)),
    [visiblePositioned],
  )
  // allPoints ignores the skip filter so the caption can tell "couldn't place any
  // stop" (a real geocode failure) apart from "everything visible was skipped".
  const allPoints = useMemo(() => positioned.filter((w): w is LatLng => Boolean(w)), [positioned])
  // Render features group the expanded points back into numbered pins (a leg's
  // two ends become one ball at their midpoint plus an endpoint marker on each).
  const features = useMemo(
    () => buildFeatures(visibleItems, visiblePositioned),
    [visibleItems, visiblePositioned],
  )
  const legend = useMemo(() => featureList(visibleItems), [visibleItems])
  const selectedAnchor = useMemo(
    () => features.find((f) => f.id === selectedId)?.anchor ?? null,
    [features, selectedId],
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
  } else if (allPoints.length === 0) {
    caption =
      'We couldn’t place any of this day’s locations. Try adding a city or country to each one.'
  } else if (points.length === 0) {
    // Every placeable stop was skipped and skipped stops are hidden.
    caption = 'Every place this day was skipped. Turn on “Show skipped” to see them.'
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
        {features.map((f) => {
          const isSelected = selectedId === f.id
          const select = () => onSelect(selectedId === f.id ? null : f.id)
          return (
            <Fragment key={f.id}>
              {f.ends.map((end) => (
                <Marker
                  key={`${f.id}:${end.role}`}
                  position={[end.coord.lat, end.coord.lng]}
                  icon={endpointIcon(isSelected, f.done)}
                  eventHandlers={{ click: select }}
                >
                  <Tooltip>{`${end.role === 'from' ? 'From' : 'To'} ${end.location}`}</Tooltip>
                </Marker>
              ))}
              <Marker
                position={[f.anchor.lat, f.anchor.lng]}
                icon={pinIcon(f.number, isSelected, f.done)}
                eventHandlers={{ click: select }}
              >
                <Tooltip>{f.label}</Tooltip>
              </Marker>
            </Fragment>
          )
        })}
        <MapController waypoints={points} selectedAnchor={selectedAnchor} />
      </MapContainer>

      {caption && <p className="day-map-caption">{caption}</p>}

      {hasSkipped && (
        <button
          type="button"
          className="day-map-toggle"
          aria-pressed={showSkipped}
          onClick={() => setShowSkipped((s) => !s)}
        >
          {showSkipped ? 'Hide skipped' : 'Show skipped'}
        </button>
      )}

      {legend.length > 0 && (
        <nav className="day-map-pins" aria-label="Map pins">
          {legend.map((f) => (
            <button
              key={f.id}
              type="button"
              className={[
                'day-map-pin',
                selectedId === f.id ? 'day-map-pin--selected' : '',
                f.done ? '' : 'day-map-pin--faint',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-label={`Pin ${f.number}: ${f.label}`}
              aria-pressed={selectedId === f.id}
              onClick={() => onSelect(selectedId === f.id ? null : f.id)}
            >
              {f.number}
            </button>
          ))}
        </nav>
      )}
    </div>
  )
}
