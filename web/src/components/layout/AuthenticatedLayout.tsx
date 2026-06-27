import { Outlet } from 'react-router-dom'
import { BottomNav } from '../ui'
import { useAuth } from '../../auth/AuthContext'
import { AppLayout } from './AppLayout'
import { SidebarNav } from './SidebarNav'
import { ThumbFab } from './ThumbFab'
import { PRIMARY_NAV_ITEMS } from './navItems'

// AuthenticatedLayout (M09.3 S2) is the route element wrapping every gated
// screen. It supplies the app's responsive navigation chrome via AppLayout:
//
//   - Laptop: a persistent SidebarNav (primary destinations + sign out).
//   - Mobile: the fixed BottomNav (same destinations) in the thumb zone, plus a
//     ThumbFab for the primary "New trip" action, bottom-right in reach.
//
// Child routes render through <Outlet> into the content column.
export function AuthenticatedLayout() {
  const { signOut } = useAuth()

  const sidebar = (
    <SidebarNav
      items={PRIMARY_NAV_ITEMS}
      footer={
        <button
          type="button"
          className="btn-secondary sidebar-nav-signout"
          onClick={() => void signOut()}
        >
          Sign out
        </button>
      }
    />
  )

  return (
    <AppLayout sidebar={sidebar} bottomNav={<BottomNav items={PRIMARY_NAV_ITEMS} />}>
      <Outlet />
      {/* Primary action in the mobile thumb zone (hidden on laptop via CSS). */}
      <ThumbFab to="/trips/new" label="New trip" icon="+" />
    </AppLayout>
  )
}
