// Vitest global test setup. Registers @testing-library/jest-dom's matchers
// (toBeInTheDocument, toHaveTextContent, …) on Vitest's expect and their types.
import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'
import { createElement, type ReactNode } from 'react'

// Leaflet needs a real, measurable DOM that jsdom can't provide, so we mock the
// map library globally to lightweight DOM stand-ins. This lets any component
// that (lazily) renders DayMap — DayView, TripShell — run in tests. DayMap's own
// tests assert against these same stand-ins (map div, clickable markers).
interface MapChildren {
  children?: ReactNode
}
interface MarkerProps extends MapChildren {
  eventHandlers?: { click?: () => void }
}
interface MapContainerProps extends MapChildren {
  'aria-label'?: string
}

vi.mock('leaflet', () => ({
  default: {
    divIcon: (opts: unknown) => opts,
    latLngBounds: (pts: unknown) => ({ pts }),
  },
}))

vi.mock('react-leaflet', () => ({
  MapContainer: (p: MapContainerProps) =>
    createElement('div', { 'data-testid': 'day-map', 'aria-label': p['aria-label'] }, p.children),
  TileLayer: () => createElement('div', { 'data-testid': 'tiles' }),
  Marker: (p: MarkerProps) =>
    createElement(
      'button',
      { type: 'button', 'data-testid': 'map-marker', onClick: p.eventHandlers?.click },
      p.children,
    ),
  Polyline: () => createElement('div', { 'data-testid': 'polyline' }),
  Tooltip: (p: MapChildren) => createElement('span', null, p.children),
  useMap: () => ({ setView: () => {}, fitBounds: () => {}, panTo: () => {} }),
}))

// jsdom does not implement Element.scrollIntoView. Stub it so effects that call
// scrollIntoView (e.g. pin↔item selection) don't throw in tests.
Element.prototype.scrollIntoView = () => {}

// jsdom does not implement window.matchMedia. Provide a minimal stub that
// returns false for all queries (desktop-mode default) so useMobile() works.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})
