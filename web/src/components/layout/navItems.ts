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

// Sidebar nav — full set of destinations shown on laptop
export const SIDEBAR_NAV_ITEMS: BottomNavItem[] = [
  {
    to: '/',
    label: 'Trips',
    icon: ic('M3 7l9-4 9 4-9 4-9-4zM3 7v10l9 4 9-4V7M12 11v10'),
  },
  {
    to: '/map',
    label: 'Map',
    icon: ic('M9 4L3 7v13l6-3 6 3 6-3V4l-6 3-6-3zM9 4v13M15 7v13'),
  },
  {
    to: '/journal',
    label: 'Journal',
    icon: ic('M5 3h11l3 3v15H5zM9 8h7M9 12h7M9 16h4'),
  },
  {
    to: '/budget',
    label: 'Budget',
    icon: ic('M4 19V9m5 10V5m5 14v-7m5 7V8'),
  },
  {
    to: '/sharing',
    label: 'Sharing',
    icon: icMulti(
      'M16 19a4 4 0 00-8 0',
      'M12 11a3 3 0 100-6 3 3 0 000 6z',
      'M20 19a3.5 3.5 0 00-5-3.2',
      'M4 19a3.5 3.5 0 015-3.2',
    ),
  },
]

export const SIDEBAR_SECONDARY_ITEMS: BottomNavItem[] = [
  {
    to: '/profile',
    label: 'Profile',
    icon: icMulti('M12 12a4 4 0 100-8 4 4 0 000 8z', 'M5 20a7 7 0 0114 0'),
  },
  {
    to: '/admin',
    label: 'Admin',
    icon: ic('M3 5h18M3 12h18M3 19h18'),
  },
]

// Mobile bottom nav — 4 items in thumb zone
export const PRIMARY_NAV_ITEMS: BottomNavItem[] = [
  {
    to: '/',
    label: 'Trips',
    icon: ic('M3 7l9-4 9 4-9 4-9-4zM3 7v10l9 4 9-4V7'),
  },
  {
    to: '/map',
    label: 'Map',
    icon: ic('M9 4L3 7v13l6-3 6 3 6-3V4l-6 3-6-3zM9 4v13'),
  },
  {
    to: '/journal',
    label: 'Journal',
    icon: ic('M5 3h11l3 3v15H5zM9 8h7M9 12h7'),
  },
  {
    to: '/profile',
    label: 'Me',
    icon: icMulti('M12 12a4 4 0 100-8 4 4 0 000 8z', 'M5 20a7 7 0 0114 0'),
  },
]
