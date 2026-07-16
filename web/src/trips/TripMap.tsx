import { Fragment, useEffect, useMemo } from 'react'
import L from 'leaflet'
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import type { LatLng } from '../lib/api'
import { buildFeatures, type LocatedItem, type RenderFeature } from './locatedItems'

// TripDayMarkers is the per-day geocoded data the overview map renders. waypoints
// line up positionally with items (waypoints[i] ↔ items[i]), mirroring DayMap.
export interface TripDayMarkers {
  date: string
  // 0-based day index; +1 is the display "Day N".
  index: number
  color: string
  items: LocatedItem[]
  waypoints: LatLng[]
}

// DEFAULT_CENTER / DEFAULT_ZOOM frame a gentle world view when the trip has no
// located stops yet — the map stays visible rather than being replaced by an
// empty-state message (same convention as DayMap).
const DEFAULT_CENTER: [number, number] = [20, 0]
const DEFAULT_ZOOM = 2

// pinIcon builds a numbered Leaflet divIcon tinted to the day's colour. Selected
// pins fill solid; pins for things that didn't happen (not done) render faint so
// they read apart from the ones that did.
function pinIcon(n: number, color: string, selected: boolean, done: boolean): L.DivIcon {
  const style = `--pin-color:${color};`
  const cls = [
    'trip-map-marker',
    selected ? 'trip-map-marker--selected' : '',
    // A selected pin is never faint — clicking it emphasises it.
    !done && !selected ? 'trip-map-marker--faint' : '',
  ]
    .filter(Boolean)
    .join(' ')
  return L.divIcon({
    className: 'trip-map-marker-wrap',
    html: `<span class="${cls}" style="${style}">${n}</span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  })
}

// endpointIcon builds the small dot dropped on a transport leg's start and finish
// — tinted to the day's colour. The number lives on the leg's ball at the arrow
// midpoint, so the ends are unlabelled markers.
function endpointIcon(color: string, done: boolean): L.DivIcon {
  const style = `--pin-color:${color};`
  const cls = ['trip-map-endpoint', !done ? 'trip-map-endpoint--faint' : '']
    .filter(Boolean)
    .join(' ')
  return L.divIcon({
    className: 'trip-map-marker-wrap',
    html: `<span class="${cls}" style="${style}"></span>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  })
}

// dayFeatures memo-key friendly: derive each day's render features once.
interface DayFeatures extends TripDayMarkers {
  features: RenderFeature[]
}

// allPoints flattens every day's waypoints into a single list for whole-trip
// bounds fitting.
function allPoints(days: TripDayMarkers[]): LatLng[] {
  return days.flatMap((d) => d.waypoints)
}

// MapController fits the view to the selected days' waypoints, or the whole trip
// when nothing is selected, and pans to the selected pin when it changes.
function MapController({
  days,
  selectedDates,
  selected,
}: {
  days: TripDayMarkers[]
  selectedDates: Set<string>
  selected: LatLng | null
}) {
  const map = useMap()

  useEffect(() => {
    const points =
      selectedDates.size > 0
        ? days.filter((d) => selectedDates.has(d.date)).flatMap((d) => d.waypoints)
        : allPoints(days)
    if (points.length === 0) {
      map.setView(DEFAULT_CENTER, DEFAULT_ZOOM)
      return
    }
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 14)
      return
    }
    const bounds = L.latLngBounds(points.map((w) => [w.lat, w.lng] as [number, number]))
    map.fitBounds(bounds, { padding: [32, 32] })
  }, [map, days, selectedDates])

  useEffect(() => {
    if (!selected) return
    map.panTo([selected.lat, selected.lng])
  }, [map, selected])

  return null
}

// TripMap renders one interactive OpenStreetMap view for the whole trip: every
// day's located stops, colour-coded by day, with a per-day route polyline. A
// transport leg shows both ends (a small day-tinted marker on each) joined by
// the route line, with its numbered ball on the arrow midpoint. When a subset of
// days is selected the others are hidden and the view fits to the selection (an
// empty selection means all days). Markers are wired to the shared selection
// state so clicking a pin highlights the matching day-list row. Exported as
// default so React.lazy can defer the map bundle.
export default function TripMap({
  days,
  selectedDates,
  selectedId,
  onSelect,
}: {
  days: TripDayMarkers[]
  selectedDates: Set<string>
  selectedId: string | null
  onSelect: (id: string | null) => void
}) {
  const dayFeatures = useMemo<DayFeatures[]>(
    () => days.map((d) => ({ ...d, features: buildFeatures(d.items, d.waypoints) })),
    [days],
  )

  // Coordinates of the currently selected feature (across all days), used to pan.
  const selected = useMemo<LatLng | null>(() => {
    if (!selectedId) return null
    for (const day of dayFeatures) {
      const f = day.features.find((it) => it.id === selectedId)
      if (f) return f.anchor
    }
    return null
  }, [selectedId, dayFeatures])

  return (
    <div className="trip-map">
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        scrollWheelZoom={false}
        className="trip-map-leaflet"
        aria-label="Trip map — all days"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {dayFeatures.map((day) => {
          // When a subset of days is selected, non-selected days are hidden
          // entirely — focusing a day clears the rest of the trip's pins rather
          // than leaving them dimmed on the map. An empty selection shows all.
          if (selectedDates.size > 0 && !selectedDates.has(day.date)) return null
          const positions = day.waypoints.map((w) => [w.lat, w.lng] as [number, number])
          return (
            <Fragment key={day.date}>
              {positions.length > 1 && (
                <Polyline
                  positions={positions}
                  pathOptions={{ color: day.color, weight: 3, opacity: 0.5 }}
                />
              )}
              {day.features.map((f) => {
                const isSelected = selectedId === f.id
                const select = () => onSelect(selectedId === f.id ? null : f.id)
                return (
                  <Fragment key={`${day.date}:${f.id}`}>
                    {f.ends.map((end) => (
                      <Marker
                        key={`${f.id}:${end.role}`}
                        position={[end.coord.lat, end.coord.lng]}
                        icon={endpointIcon(day.color, f.done)}
                        eventHandlers={{ click: select }}
                      >
                        <Tooltip>
                          Day {day.index + 1} · {end.role === 'from' ? 'From' : 'To'} {end.location}
                        </Tooltip>
                      </Marker>
                    ))}
                    <Marker
                      position={[f.anchor.lat, f.anchor.lng]}
                      icon={pinIcon(f.number, day.color, isSelected, f.done)}
                      eventHandlers={{ click: select }}
                    >
                      <Tooltip>
                        Day {day.index + 1} · {f.label}
                      </Tooltip>
                    </Marker>
                  </Fragment>
                )
              })}
            </Fragment>
          )
        })}
        <MapController days={days} selectedDates={selectedDates} selected={selected} />
      </MapContainer>
    </div>
  )
}
