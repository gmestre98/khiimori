import { Outlet, useLocation } from 'react-router-dom'
import { BottomNav } from '../ui'
import { useAuth } from '../../auth/AuthContext'
import { AppLayout } from './AppLayout'
import { SidebarNav } from './SidebarNav'
import { ThumbFab } from './ThumbFab'
import { OfflineBanner } from './OfflineBanner'
import { SyncStatus } from './SyncStatus'
import { PRIMARY_NAV_ITEMS, SIDEBAR_NAV_ITEMS, SIDEBAR_SECONDARY_ITEMS } from './navItems'

export function AuthenticatedLayout() {
  const { signOut, user } = useAuth()
  const { pathname } = useLocation()
  const showNewTripFab = pathname === '/'

  const userName = user?.name ?? user?.email?.split('@')[0] ?? 'You'

  const sidebar = (
    <SidebarNav
      items={SIDEBAR_NAV_ITEMS}
      secondaryItems={SIDEBAR_SECONDARY_ITEMS}
      userName={userName}
      userMeta="EUR · Lisbon"
      onSignOut={() => void signOut()}
    />
  )

  return (
    <AppLayout sidebar={sidebar} bottomNav={<BottomNav items={PRIMARY_NAV_ITEMS} />}>
      <OfflineBanner />
      <SyncStatus />
      <Outlet />
      {showNewTripFab && <ThumbFab to="/trips/new" label="New trip" icon="+" />}
    </AppLayout>
  )
}
