import { createElement } from 'react'
import { type BottomNavItem } from '../ui'

// SVG icon helper — matches the Lucide-style stroke icons in khiimori-design.html
function ic(path: string) {
  return createElement(
    'svg',
    {
      width: 18,
      height: 18,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: '1.7',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
    createElement('path', { d: path }),
  )
}

function icMulti(...paths: string[]) {
  return createElement(
    'svg',
    {
      width: 18,
      height: 18,
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: '1.7',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
    },
    ...paths.map((d) => createElement('path', { d })),
  )
}

// Icon set, defined once and shared between the sidebar and the mobile bottom nav.
const ICONS = {
  trips: ic('M3 7l9-4 9 4-9 4-9-4zM3 7v10l9 4 9-4V7M12 11v10'),
  map: ic('M9 4L3 7v13l6-3 6 3 6-3V4l-6 3-6-3zM9 4v13M15 7v13'),
  journal: ic('M5 3h11l3 3v15H5zM9 8h7M9 12h7M9 16h4'),
  budget: ic('M4 19V9m5 10V5m5 14v-7m5 7V8'),
  sharing: icMulti(
    'M16 19a4 4 0 00-8 0',
    'M12 11a3 3 0 100-6 3 3 0 000 6z',
    'M20 19a3.5 3.5 0 00-5-3.2',
    'M4 19a3.5 3.5 0 015-3.2',
  ),
  profile: icMulti('M12 12a4 4 0 100-8 4 4 0 000 8z', 'M5 20a7 7 0 0114 0'),
  admin: ic('M3 5h18M3 12h18M3 19h18'),
}

// Map / Journal / Budget / Sharing are facets of a single trip, so when a trip is
// active these point into it (the day view carries both the map and the journal;
// budget and sharing have their own routes). With no active trip they fall back
// to the dashboard. From any trip screen the "← Trips" crumb returns to the
// dashboard to pick a different trip.
function tripPath(activeTripId: string | null, suffix = ''): string {
  return activeTripId ? `/trips/${activeTripId}${suffix}` : '/'
}

// buildSidebarNavItems returns the full laptop sidebar destinations, routed into
// the active trip where applicable.
export function buildSidebarNavItems(activeTripId: string | null): BottomNavItem[] {
  return [
    { to: '/', label: 'My Trips', icon: ICONS.trips },
    { to: tripPath(activeTripId), label: 'Map', icon: ICONS.map },
    { to: tripPath(activeTripId), label: 'Journal', icon: ICONS.journal },
    { to: tripPath(activeTripId, '/budget'), label: 'Budget', icon: ICONS.budget },
    { to: tripPath(activeTripId, '/sharing'), label: 'Sharing', icon: ICONS.sharing },
  ]
}

// Profile and Admin are user-level, never trip-scoped.
export const SIDEBAR_SECONDARY_ITEMS: BottomNavItem[] = [
  { to: '/profile', label: 'Profile', icon: ICONS.profile },
  { to: '/admin', label: 'Admin', icon: ICONS.admin },
]

// buildPrimaryNavItems returns the mobile bottom-nav items in the thumb zone.
// Only the two true global destinations live here: Trips and Me. A trip's facets
// (Plan / Map / Budget / Journal) are not top-level destinations — they're
// switched via the in-trip segmented tab bar (see DayView), so putting Map and
// Journal in the bottom bar was redundant (both just reopened the trip).
export function buildPrimaryNavItems(): BottomNavItem[] {
  return [
    { to: '/', label: 'Trips', icon: ICONS.trips },
    { to: '/profile', label: 'Me', icon: ICONS.profile },
  ]
}

// Static defaults (no active trip) — used by tests and as a stable fallback.
export const SIDEBAR_NAV_ITEMS: BottomNavItem[] = buildSidebarNavItems(null)
export const PRIMARY_NAV_ITEMS: BottomNavItem[] = buildPrimaryNavItems()
