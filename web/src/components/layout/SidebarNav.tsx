import { NavLink } from 'react-router-dom'
import { type BottomNavItem } from '../ui'

export interface SidebarNavProps {
  /** Primary destinations — same list the mobile bottom nav uses. */
  items: BottomNavItem[]
  /** Optional footer slot (e.g. sign-out button). */
  footer?: React.ReactNode
}

// SidebarNav (M09.3 S2) is the comfortable laptop navigation: a vertical list of
// the same primary destinations the mobile BottomNav renders, shown in
// AppLayout's persistent sidebar. The mobile/laptop split is structural, not a
// different information architecture.
export function SidebarNav({ items, footer }: SidebarNavProps) {
  return (
    <nav className="sidebar-nav" aria-label="Primary">
      <div className="sidebar-nav-brand">Khiimori</div>
      <ul className="sidebar-nav-list" role="list">
        {items.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                ['sidebar-nav-link', isActive ? 'sidebar-nav-link--active' : '']
                  .filter(Boolean)
                  .join(' ')
              }
            >
              <span className="sidebar-nav-icon" aria-hidden="true">
                {item.icon}
              </span>
              <span className="sidebar-nav-label">{item.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
      {footer && <div className="sidebar-nav-footer">{footer}</div>}
    </nav>
  )
}
