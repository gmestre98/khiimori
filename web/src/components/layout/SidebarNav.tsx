import { NavLink } from 'react-router-dom'
import { type BottomNavItem } from '../ui'

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

function NavItem({ item }: { item: BottomNavItem }) {
  return (
    <li>
      <NavLink
        to={item.to}
        end={item.to === '/'}
        className={({ isActive }) =>
          ['sidebar-nav-link', isActive ? 'sidebar-nav-link--active' : ''].filter(Boolean).join(' ')
        }
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
          <NavItem key={item.label} item={item} />
        ))}

        {secondaryItems && secondaryItems.length > 0 && (
          <>
            <li className="sidebar-nav-divider" role="separator" />
            {secondaryItems.map((item) => (
              <NavItem key={item.label} item={item} />
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
