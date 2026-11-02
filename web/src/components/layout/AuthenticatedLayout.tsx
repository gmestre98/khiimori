import { Outlet, useMatch } from 'react-router-dom'
import { BottomNav } from '../ui'
import { useAuth } from '../../auth/AuthContext'
import { useSelectedTrip } from '../../lib/useSelectedTrip'
import { useCachedResource } from '../../lib/useCachedResource'
import { cacheKeys } from '../../lib/cacheKeys'
import { fetchBacklog } from '../../lib/api'
import { AppLayout } from './AppLayout'
import { SidebarNav } from './SidebarNav'
import { OfflineBanner } from './OfflineBanner'
import { SyncStatus } from './SyncStatus'
import { buildTripBottomNavItems } from './navItems'

// AuthenticatedLayout wraps every signed-in screen. Desktop gets the single
// trips sidebar; phones get the 5-tab trip bar only while a trip is open (the
// Trips screen has its own header with the profile avatar, so no bar there).
export function AuthenticatedLayout() {
  const { signOut, user } = useAuth()
  const tripMatch = useMatch('/trips/:tripId/*')
  const routeTripId = tripMatch?.params.tripId ?? null
  const onTripRoute = routeTripId !== null && routeTripId !== 'new'
  const activeTripId = onTripRoute ? routeTripId : null
  // Keeps the sidebar's trips list loaded and the remembered pick in sync with
  // the URL.
  const tripSwitcher = useSelectedTrip(activeTripId)

  // Backlog count for the sidebar's nested "Backlog" row. Cache-first, quiet on
  // failure (the row just shows no count).
  const { data: backlog } = useCachedResource(
    activeTripId ? cacheKeys.backlog(activeTripId) : null,
    (signal) => fetchBacklog(activeTripId as string, signal),
  )

  const userName = user?.name || user?.email?.split('@')[0] || 'You'

  const sidebar = (
    <SidebarNav
      tripSwitcher={tripSwitcher}
      activeTripId={activeTripId}
      backlogCount={backlog?.length ?? null}
      userName={userName}
      onSignOut={() => void signOut()}
    />
  )

  const bottomNav = activeTripId ? (
    <BottomNav items={buildTripBottomNavItems(activeTripId)} />
  ) : undefined

  return (
    <AppLayout sidebar={sidebar} bottomNav={bottomNav}>
      <OfflineBanner />
      <SyncStatus />
      <Outlet />
    </AppLayout>
  )
}
