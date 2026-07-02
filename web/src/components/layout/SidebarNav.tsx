import { NavLink, useLocation } from 'react-router-dom'
import { type BottomNavItem } from '../ui'

// Length of `to` if `pathname` is `to` or a descendant of it, else -1. Used to
// pick the single most-specific nav destination for the current URL, so that a
// parent link (e.g. Map/Journal at /trips/:id) doesn't stay highlighted while a
// child route (e.g. /trips/:id/budget) is open.
function prefixMatchLength(pathname: string, to: string): number {
  if (pathname === to) return to.length
  const boundary = to.endsWith('/') ? to : `${to}/`
  return pathname.startsWith(boundary) ? to.length : -1
}

export interface SidebarNavProps {
  /** Primary navigation items */
  items: BottomNavItem[]
  /** Secondary items shown below a divider (e.g. Profile, Admin) */
  secondaryItems?: BottomNavItem[]
  /** User display name — shown in the footer avatar */
  userName?: string
  /** Short meta line below user name (e.g. "EUR · Lisbon") */
  userMeta?: string
  /** Sign-out action */
  onSignOut?: () => void
}

function NavItem({ item, active }: { item: BottomNavItem; active: boolean }) {
  return (
    <li>
      <NavLink
        to={item.to}
        className={['sidebar-nav-link', active ? 'sidebar-nav-link--active' : '']
          .filter(Boolean)
          .join(' ')}
      >
        <span className="sidebar-nav-icon" aria-hidden="true">
          {item.icon}
        </span>
        <span className="sidebar-nav-label">{item.label}</span>
      </NavLink>
    </li>
  )
}

export function SidebarNav({
  items,
  secondaryItems,
  userName,
  userMeta,
  onSignOut,
}: SidebarNavProps) {
  const initial = userName ? userName[0].toUpperCase() : 'U'

  const { pathname } = useLocation()
  // Highlight only the most-specific matching destination. Two links may share a
  // `to` (Map and Journal both open the trip day view) — those still light up
  // together, which is intended; the fix is that a shorter parent path no longer
  // stays active once a deeper child (Budget / Sharing) is open.
  const allItems = [...items, ...(secondaryItems ?? [])]
  const bestMatchLength = allItems.reduce(
    (best, item) => Math.max(best, prefixMatchLength(pathname, item.to)),
    -1,
  )
  const isActive = (item: BottomNavItem) =>
    prefixMatchLength(pathname, item.to) === bestMatchLength && bestMatchLength >= 0

  return (
    <nav className="sidebar-nav" aria-label="Primary">
      {/* Brand */}
      <div className="sidebar-nav-brand">
        <div className="sidebar-nav-brand-mark" aria-hidden="true">
          K
        </div>
        <span className="sidebar-nav-brand-name">Khiimori</span>
      </div>

      {/* Primary nav */}
      <ul className="sidebar-nav-list" role="list">
        {items.map((item) => (
          <NavItem key={item.label} item={item} active={isActive(item)} />
        ))}

        {secondaryItems && secondaryItems.length > 0 && (
          <>
            <li className="sidebar-nav-divider" role="separator" />
            {secondaryItems.map((item) => (
              <NavItem key={item.label} item={item} active={isActive(item)} />
            ))}
          </>
        )}
      </ul>

      {/* User footer */}
      <div className="sidebar-nav-footer">
        <div className="sidebar-nav-user">
          <div className="sidebar-nav-avatar" aria-hidden="true">
            {initial}
          </div>
          <div className="sidebar-nav-user-info">
            <div className="sidebar-nav-user-name">{userName ?? 'Account'}</div>
            {userMeta && <div className="sidebar-nav-user-meta">{userMeta}</div>}
          </div>
        </div>
        {onSignOut && (
          <button type="button" className="sidebar-nav-signout" onClick={onSignOut}>
            Sign out
          </button>
        )}
      </div>
    </nav>
  )
}
