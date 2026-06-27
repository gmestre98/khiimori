import { type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'

export interface BottomNavItem {
  /** Route path for NavLink. */
  to: string
  /** Short label shown below the icon. */
  label: string
  /** Icon element (emoji, SVG, or img). */
  icon: ReactNode
}

export interface BottomNavProps {
  items: BottomNavItem[]
  className?: string
}

export function BottomNav({ items, className = '' }: BottomNavProps) {
  return (
    <nav
      className={['bottom-nav', className].filter(Boolean).join(' ')}
      aria-label="Main navigation"
    >
      <ul className="bottom-nav-list" role="list">
        {items.map((item) => (
          <li key={item.to} className="bottom-nav-item">
            <NavLink
              to={item.to}
              className={({ isActive }) =>
                ['bottom-nav-link', isActive ? 'bottom-nav-link--active' : '']
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
        ))}
      </ul>
    </nav>
  )
}
