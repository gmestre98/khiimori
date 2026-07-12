import { Fragment, useEffect, useMemo } from 'react'
import L from 'leaflet'
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import type { LatLng } from '../lib/api'
import type { LocatedItem } from './locatedItems'

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

// DIM_OPACITY is applied to days other than the focused one so the focused day
// stands out without hiding the rest of the trip.
const DIM_OPACITY = 0.25

// pinIcon builds a numbered Leaflet divIcon tinted to the day's colour. Selected
// pins fill solid; dimmed pins (non-focused day) fade back; pins for things that
// didn't happen (not done) render faint so they read apart from the ones that did.
function pinIcon(
  n: number,
  color: string,
  selected: boolean,
  dimmed: boolean,
  done: boolean,
): L.DivIcon {
  const style = `--pin-color:${color};${dimmed ? 'opacity:' + DIM_OPACITY + ';' : ''}`
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
// day's located stops, colour-coded by day, with a per-day route polyline. When
// a subset of days is selected the others dim back and the view fits to the
// selection (an empty selection means all days). Markers are wired to the shared
// selection state so clicking a pin highlights the matching day-list row.
// Exported as default so React.lazy can defer the map bundle.
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
  // Coordinates of the currently selected pin (across all days), used to pan.
  const selected = useMemo<LatLng | null>(() => {
    if (!selectedId) return null
    for (const day of days) {
      const i = day.items.findIndex((it) => it.id === selectedId)
      if (i >= 0 && i < day.waypoints.length) return day.waypoints[i]
    }
    return null
  }, [selectedId, days])

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
        {days.map((day) => {
          const dimmed = selectedDates.size > 0 && !selectedDates.has(day.date)
          const positions = day.waypoints.map((w) => [w.lat, w.lng] as [number, number])
          return (
            <Fragment key={day.date}>
              {positions.length > 1 && (
                <Polyline
                  positions={positions}
                  pathOptions={{
                    color: day.color,
                    weight: 3,
                    opacity: dimmed ? DIM_OPACITY * 0.6 : 0.5,
                  }}
                />
              )}
              {day.waypoints.map((wp, i) => {
                const item: LocatedItem | undefined = day.items[i]
                const isSelected = !!item && selectedId === item.id
                return (
                  <Marker
                    key={item?.id ?? `${day.date}:${wp.lat},${wp.lng}`}
                    position={[wp.lat, wp.lng]}
                    icon={pinIcon(i + 1, day.color, isSelected, dimmed, item?.done ?? true)}
                    eventHandlers={{
                      click: () => item && onSelect(selectedId === item.id ? null : item.id),
                    }}
                  >
                    {item && (
                      <Tooltip>
                        Day {day.index + 1} · {item.label}
                      </Tooltip>
                    )}
                  </Marker>
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
