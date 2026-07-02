import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { type BottomNavItem } from '../ui'
import { type Trip } from '../../lib/api'
import { type TripSwitcher } from '../../lib/useSelectedTrip'
import { TRIP_TAB_ICON } from './navItems'

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
  /**
   * Dynamic trip switcher rendered as a "Trip · <name>" tab directly below the
   * first primary item (My Trips). Omitted (or with no selected trip) hides it.
   */
  tripSwitcher?: TripSwitcher
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

// TripSwitcherItem is the dynamic sidebar tab. Its label (a NavLink) opens the
// selected trip; its caret toggles a dropdown that lists the user's trips
// grouped into "Current & upcoming" and "Past", so they can switch which trip
// the tab (and the trip-scoped nav) points at. The choice is remembered.
function TripSwitcherItem({ switcher, active }: { switcher: TripSwitcher; active: boolean }) {
  const { trips, selectedTrip, selectTrip } = switcher
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLLIElement | null>(null)
  const navigate = useNavigate()

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!selectedTrip || !trips) return null

  const upcoming = [...trips.current, ...trips.upcoming]
  const past = trips.past

  const choose = (trip: Trip) => {
    selectTrip(trip.id)
    setOpen(false)
    navigate(`/trips/${trip.id}`, { state: { trip } })
  }

  const renderGroup = (label: string, list: Trip[]) =>
    list.length > 0 && (
      <>
        <li className="trip-switcher-group" role="presentation">
          {label}
        </li>
        {list.map((t) => (
          <li key={t.id} role="none">
            <button
              type="button"
              role="option"
              aria-selected={t.id === selectedTrip.id}
              className={[
                'trip-switcher-option',
                t.id === selectedTrip.id ? 'trip-switcher-option--selected' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => choose(t)}
            >
              <span className="trip-switcher-option-name">{t.name}</span>
              {t.destinations.length > 0 && (
                <span className="trip-switcher-option-meta">{t.destinations.join(', ')}</span>
              )}
            </button>
          </li>
        ))}
      </>
    )

  return (
    <li className="trip-switcher" ref={rootRef}>
      <div className={['trip-switcher-row', active ? 'trip-switcher-row--active' : ''].join(' ')}>
        <NavLink
          to={`/trips/${selectedTrip.id}`}
          state={{ trip: selectedTrip }}
          className="sidebar-nav-link trip-switcher-link"
        >
          <span className="sidebar-nav-icon" aria-hidden="true">
            {TRIP_TAB_ICON}
          </span>
          <span className="sidebar-nav-label trip-switcher-label">
            <span className="trip-switcher-eyebrow">Trip</span>
            <span className="trip-switcher-name">{selectedTrip.name}</span>
          </span>
        </NavLink>
        <button
          type="button"
          className="trip-switcher-caret"
          aria-label="Switch trip"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className={
              open
                ? 'trip-switcher-caret-icon trip-switcher-caret-icon--open'
                : 'trip-switcher-caret-icon'
            }
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>
      {open && (
        <ul className="trip-switcher-menu" role="listbox" aria-label="Select a trip">
          {renderGroup('Current & upcoming', upcoming)}
          {renderGroup('Past', past)}
        </ul>
      )}
    </li>
  )
}

export function SidebarNav({
  items,
  secondaryItems,
  tripSwitcher,
  userName,
  userMeta,
  onSignOut,
}: SidebarNavProps) {
  const initial = userName ? userName[0].toUpperCase() : 'U'

  const { pathname } = useLocation()
  // Highlight only the most-specific matching destination. Two links may share a
  // `to` (Map and Journal both open the trip day view) — those still light up
  // together, which is intended; the fix is that a shorter parent path no longer
  // stays active once a deeper child (Budget / Sharing) is open. The Trip
  // switcher tab participates too (it points at /trips/:selectedId).
  const selectedTripTo = tripSwitcher?.selectedTrip
    ? `/trips/${tripSwitcher.selectedTrip.id}`
    : null
  const matchTargets = [
    ...items.map((i) => i.to),
    ...(selectedTripTo ? [selectedTripTo] : []),
    ...(secondaryItems ?? []).map((i) => i.to),
  ]
  const bestMatchLength = matchTargets.reduce(
    (best, to) => Math.max(best, prefixMatchLength(pathname, to)),
    -1,
  )
  const isActiveTo = (to: string) =>
    prefixMatchLength(pathname, to) === bestMatchLength && bestMatchLength >= 0

  // The first primary item (My Trips) renders first; the dynamic Trip switcher
  // tab slots in directly below it, then the remaining primary items.
  const [firstItem, ...restItems] = items

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
        {firstItem && (
          <NavItem key={firstItem.label} item={firstItem} active={isActiveTo(firstItem.to)} />
        )}

        {tripSwitcher && (
          <TripSwitcherItem
            switcher={tripSwitcher}
            active={!!selectedTripTo && isActiveTo(selectedTripTo)}
          />
        )}

        {restItems.map((item) => (
          <NavItem key={item.label} item={item} active={isActiveTo(item.to)} />
        ))}

        {secondaryItems && secondaryItems.length > 0 && (
          <>
            <li className="sidebar-nav-divider" role="separator" />
            {secondaryItems.map((item) => (
              <NavItem key={item.label} item={item} active={isActiveTo(item.to)} />
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
