import { type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'

export interface BottomNavItem {
  /** Route path for NavLink. */
  to: string
  /** Short label shown below the icon. */
  label: string
  /** Icon element (emoji, SVG, or img). */
  icon: ReactNode
  /**
   * Optional custom active predicate. When set, it decides the active state
   * instead of NavLink's path match — needed when a tab points at one route
   * (e.g. the trip's day overview) but should also stay lit on sibling routes
   * (e.g. a single day, the backlog). Receives the current pathname.
   */
  activeWhen?: (pathname: string) => boolean
}

export interface BottomNavProps {
  items: BottomNavItem[]
  className?: string
}

export function BottomNav({ items, className = '' }: BottomNavProps) {
  const { pathname } = useLocation()
  return (
    <nav
      className={['bottom-nav', className].filter(Boolean).join(' ')}
      aria-label="Main navigation"
    >
      <ul className="bottom-nav-list" role="list">
        {items.map((item) => {
          const forcedActive = item.activeWhen ? item.activeWhen(pathname) : null
          return (
            <li key={item.label} className="bottom-nav-item">
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  ['bottom-nav-link', (forcedActive ?? isActive) ? 'bottom-nav-link--active' : '']
                    .filter(Boolean)
                    .join(' ')
                }
                aria-current={undefined}
              >
                <span className="bottom-nav-icon" aria-hidden="true">
                  {item.icon}
                </span>
                <span className="bottom-nav-label">{item.label}</span>
              </NavLink>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
