import { createElement } from 'react'
import { type BottomNavItem } from '../ui'
import { Icon, type IconName } from '../ui/Icon'

// Navigation model (field-guide redesign). One information architecture, two
// presentations — never both at once:
//
//   - Phone, inside a trip: a 5-tab bottom bar (Days · Map · Journal · Money ·
//     Prep). "Back to Trips" lives in the trip header, Share in the header too.
//   - Phone, outside a trip: no bottom bar. The Trips screen carries the profile
//     avatar; Admin is reached from Profile.
//   - Desktop: one left sidebar listing trips, with the active trip's sections
//     nested under it (the same five + Backlog). No top tab bar.
//
// Section routes keep their historical paths so bookmarks still land:
// Money → /budget, Prep → /packing, Share → /sharing.

function icon(name: IconName) {
  return createElement(Icon, { name, size: 22 })
}

// isDaysPath: "Days" covers the days list, a single day and the backlog.
function isDaysPath(p: string): boolean {
  return p.endsWith('/plan') || p.includes('/days/') || p.endsWith('/backlog')
}

export interface TripSection extends BottomNavItem {
  key: 'days' | 'map' | 'journal' | 'money' | 'prep' | 'backlog'
}

// buildTripSections lists a trip's sections in display order. The sidebar shows
// all six; the phone bar drops Backlog (reached from the Days list instead).
export function buildTripSections(tripId: string): TripSection[] {
  const base = `/trips/${tripId}`
  return [
    {
      key: 'days',
      to: `${base}/plan`,
      label: 'Days',
      icon: icon('days'),
      activeWhen: (p) => isDaysPath(p) && !p.endsWith('/backlog'),
    },
    { key: 'map', to: `${base}/map`, label: 'Map', icon: icon('map') },
    { key: 'journal', to: `${base}/journal`, label: 'Journal', icon: icon('journal') },
    { key: 'money', to: `${base}/budget`, label: 'Money', icon: icon('money') },
    { key: 'prep', to: `${base}/packing`, label: 'Prep', icon: icon('prep') },
    { key: 'backlog', to: `${base}/backlog`, label: 'Backlog', icon: icon('backlog') },
  ]
}

// buildTripBottomNavItems is the phone bar inside a trip: Days, Map, Journal,
// Money, Prep. Days stays lit on a single day and on the backlog (both are part
// of planning the days).
export function buildTripBottomNavItems(tripId: string): BottomNavItem[] {
  return buildTripSections(tripId)
    .filter((s) => s.key !== 'backlog')
    .map((s) => (s.key === 'days' ? { ...s, activeWhen: isDaysPath } : s))
}

// sidebarSectionLabel: on desktop the map section also hosts the Stays view, so
// it reads "Map & stays" there (the phone bar keeps the short label).
export function sidebarSectionLabel(section: TripSection): string {
  return section.key === 'map' ? 'Map & stays' : section.label
}
