import { type ReactNode } from 'react'
import { Link } from 'react-router-dom'

export interface NavBarProps {
  /** Back link destination. When provided, a back arrow is shown. */
  backTo?: string
  /** Label for the back link (screen-reader + visible). */
  backLabel?: string
  /** Primary heading text. */
  title: string
  /** Optional subtitle / metadata line below the title. */
  subtitle?: string
  /** Slot for right-side actions (buttons, links). */
  actions?: ReactNode
  className?: string
}

export function NavBar({
  backTo,
  backLabel = 'Back',
  title,
  subtitle,
  actions,
  className = '',
}: NavBarProps) {
  return (
    <header className={['nav-bar', className].filter(Boolean).join(' ')} role="banner">
      {backTo && (
        <Link to={backTo} className="nav-bar-back" aria-label={backLabel}>
          ← {backLabel}
        </Link>
      )}
      <div className="nav-bar-title-group">
        <h2 className="nav-bar-title">{title}</h2>
        {subtitle && <p className="nav-bar-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="nav-bar-actions">{actions}</div>}
    </header>
  )
}
