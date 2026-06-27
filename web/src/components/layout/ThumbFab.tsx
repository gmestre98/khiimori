import { type ReactNode } from 'react'
import { Link } from 'react-router-dom'

export interface ThumbFabProps {
  /** Route to navigate to when tapped (mutually exclusive with onClick). */
  to?: string
  /** Click handler (mutually exclusive with `to`). */
  onClick?: () => void
  /** Accessible label (always rendered for screen readers). */
  label: string
  /** Icon shown in the button (decorative). */
  icon: ReactNode
  className?: string
}

// ThumbFab (M09.3 S2) is the primary action affordance for the mobile layout: a
// floating action button pinned to the bottom-right thumb zone, sitting just
// above the fixed bottom nav. It has a large (≥56px) tap target. It is
// mobile-only (hidden on laptop via CSS) — the comfortable laptop layout places
// primary actions inline in the content/header instead.
export function ThumbFab({ to, onClick, label, icon, className = '' }: ThumbFabProps) {
  const classes = ['thumb-fab', className].filter(Boolean).join(' ')
  const content = (
    <>
      <span className="thumb-fab-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="thumb-fab-label">{label}</span>
    </>
  )

  if (to) {
    return (
      <Link to={to} className={classes} aria-label={label}>
        {content}
      </Link>
    )
  }
  return (
    <button type="button" className={classes} aria-label={label} onClick={onClick}>
      {content}
    </button>
  )
}
