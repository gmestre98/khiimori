import { Outlet } from 'react-router-dom'
import { BottomNav } from '../ui'
import { useAuth } from '../../auth/AuthContext'
import { useSelectedTrip } from '../../lib/useSelectedTrip'
import { AppLayout } from './AppLayout'
import { SidebarNav } from './SidebarNav'
import { OfflineBanner } from './OfflineBanner'
import { SyncStatus } from './SyncStatus'
import { buildPrimaryNavItems, buildSidebarNavItems, buildSidebarSecondaryItems } from './navItems'

export function AuthenticatedLayout() {
  const { signOut, user } = useAuth()
  // The selected trip drives both the dynamic "Trip · …" switcher tab and the
  // trip-scoped nav (Map / Journal / Budget / Sharing), so they all follow the
  // trip the user is currently viewing rather than always the default.
  const tripSwitcher = useSelectedTrip()
  const activeTripId = tripSwitcher.selectedTrip?.id ?? null

  const userName = user?.name ?? user?.email?.split('@')[0] ?? 'You'

  const sidebar = (
    <SidebarNav
      items={buildSidebarNavItems(activeTripId)}
      secondaryItems={buildSidebarSecondaryItems(user?.is_admin ?? false)}
      tripSwitcher={tripSwitcher}
      userName={userName}
      userMeta="EUR · Lisbon"
      onSignOut={() => void signOut()}
    />
  )

  return (
    <AppLayout sidebar={sidebar} bottomNav={<BottomNav items={buildPrimaryNavItems()} />}>
      <OfflineBanner />
      <SyncStatus />
      <Outlet />
    </AppLayout>
  )
}
