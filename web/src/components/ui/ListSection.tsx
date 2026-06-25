import { type ReactNode } from 'react'

export interface ListSectionProps {
  /** Optional section heading. */
  title?: string
  children: ReactNode
  className?: string
}

export function ListSection({ title, children, className = '' }: ListSectionProps) {
  return (
    <section className={['list-section', className].filter(Boolean).join(' ')}>
      {title && <h3 className="list-section-title">{title}</h3>}
      <ul className="list-section-list" role="list">
        {children}
      </ul>
    </section>
  )
}

export interface ListRowProps {
  children: ReactNode
  /** Applied when the row is in a selected/active state. */
  selected?: boolean
  onClick?: () => void
  className?: string
}

export function ListRow({ children, selected, onClick, className = '' }: ListRowProps) {
  const cls = [
    'list-row',
    selected ? 'list-row--selected' : '',
    onClick ? 'list-row--interactive' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  if (onClick) {
    return (
      <li
        className={cls}
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onClick()
          }
        }}
      >
        {children}
      </li>
    )
  }

  return <li className={cls}>{children}</li>
}
