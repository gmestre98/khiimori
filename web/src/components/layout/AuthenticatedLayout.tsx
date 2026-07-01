import { Outlet } from 'react-router-dom'
import { BottomNav } from '../ui'
import { useAuth } from '../../auth/AuthContext'
import { useActiveTrip } from '../../lib/useActiveTrip'
import { AppLayout } from './AppLayout'
import { SidebarNav } from './SidebarNav'
import { OfflineBanner } from './OfflineBanner'
import { SyncStatus } from './SyncStatus'
import { buildPrimaryNavItems, buildSidebarNavItems, SIDEBAR_SECONDARY_ITEMS } from './navItems'

export function AuthenticatedLayout() {
  const { signOut, user } = useAuth()
  // The active trip routes the trip-scoped nav (Map / Journal / Budget /
  // Sharing) into the current trip rather than back to the dashboard.
  const activeTrip = useActiveTrip()
  const activeTripId = activeTrip?.id ?? null

  const userName = user?.name ?? user?.email?.split('@')[0] ?? 'You'

  const sidebar = (
    <SidebarNav
      items={buildSidebarNavItems(activeTripId)}
      secondaryItems={SIDEBAR_SECONDARY_ITEMS}
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
