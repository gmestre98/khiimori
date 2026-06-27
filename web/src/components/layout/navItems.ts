import { type BottomNavItem } from '../ui'

// Primary navigation destinations (M09.3 S2). Single source of truth so the
// laptop sidebar and the mobile bottom nav render the same structure — the
// mobile layout is purpose-built, not divergent. Aligns with the M03 shell:
// Trips is the home/dashboard, Profile the account screen.
//
// BottomNavItem already carries { to, label, icon }; the sidebar reuses the
// same shape, so the list is typed as BottomNavItem[].
export const PRIMARY_NAV_ITEMS: BottomNavItem[] = [
  { to: '/', label: 'Trips', icon: '✈️' },
  { to: '/profile', label: 'Profile', icon: '👤' },
]
