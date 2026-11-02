import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { type Trip } from '../../lib/api'
import { formatDateRange } from '../../lib/format'
import { type TripSwitcher } from '../../lib/useSelectedTrip'
import { Icon } from '../ui/Icon'
import { buildTripSections, sidebarSectionLabel, type TripSection } from './navItems'

export interface SidebarNavProps {
  /** The user's trips + the trip currently open (drives the nested sections). */
  tripSwitcher: TripSwitcher
  /** The trip id in the URL, when a trip screen is open. */
  activeTripId: string | null
  /** Backlog count for the active trip, when known. */
  backlogCount?: number | null
  /** User display name — shown in the footer avatar. */
  userName?: string
  /** Sign-out action. */
  onSignOut?: () => void
}

// isSectionActive decides which nested section is current. A section with an
// activeWhen predicate (Days) owns several routes; the others match by path.
function isSectionActive(section: TripSection, pathname: string): boolean {
  if (section.activeWhen) return section.activeWhen(pathname)
  return pathname === section.to || pathname.startsWith(`${section.to}/`)
}

function TripRow({
  trip,
  current,
  sections,
  pathname,
  backlogCount,
}: {
  trip: Trip
  current: boolean
  sections: TripSection[] | null
  pathname: string
  backlogCount?: number | null
}) {
  return (
    <li className="sidebar-trip">
      <Link
        to={`/trips/${trip.id}/plan`}
        state={{ trip }}
        className={['sidebar-trip-link', current ? 'sidebar-trip-link--current' : '']
          .filter(Boolean)
          .join(' ')}
        aria-current={current && pathname.endsWith('/plan') ? 'page' : undefined}
      >
        <span className="sidebar-trip-name">{trip.name}</span>
        <span className="sidebar-trip-dates">
          {formatDateRange(trip.start_date, trip.end_date)}
        </span>
      </Link>
      {current && sections && (
        <ul className="sidebar-sections" aria-label={`${trip.name} sections`}>
          {sections.map((s) => {
            const active = isSectionActive(s, pathname)
            return (
              <li key={s.key}>
                <Link
                  to={s.to}
                  state={{ trip }}
                  className={['sidebar-section', active ? 'sidebar-section--active' : '']
                    .filter(Boolean)
                    .join(' ')}
                  aria-current={active ? 'page' : undefined}
                >
                  <span>{sidebarSectionLabel(s)}</span>
                  {s.key === 'backlog' && backlogCount != null && backlogCount > 0 && (
                    <span className="sidebar-section-count">{backlogCount}</span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </li>
  )
}

// SidebarNav is the single desktop navigation: the brand, the user's upcoming
// trips (the open one expands to show its sections), a collapsible "Past trips
// (n)" group, a "New trip" action, and the profile footer. It replaces both the
// old flat sidebar and the in-trip top tab bar.
export function SidebarNav({
  tripSwitcher,
  activeTripId,
  backlogCount,
  userName,
  onSignOut,
}: SidebarNavProps) {
  const { pathname } = useLocation()
  const { trips } = tripSwitcher
  const upcoming = trips ? [...trips.current, ...trips.upcoming] : []
  const past = trips?.past ?? []
  const activeIsPast = !!activeTripId && past.some((t) => t.id === activeTripId)
  const [pastOpen, setPastOpen] = useState(false)
  const showPast = pastOpen || activeIsPast
  const sections = activeTripId ? buildTripSections(activeTripId) : null
  const initial = userName ? userName[0].toUpperCase() : 'U'
  const onTrips = pathname === '/'

  return (
    <nav className="sidebar-nav" aria-label="Primary">
      <Link to="/" className="sidebar-brand" aria-current={onTrips ? 'page' : undefined}>
        Khiimori
      </Link>

      <div className="sidebar-scroll">
        <Link
          to="/"
          className={['sidebar-all-trips', onTrips ? 'sidebar-all-trips--active' : '']
            .filter(Boolean)
            .join(' ')}
        >
          All trips
        </Link>

        {upcoming.length > 0 && (
          <>
            <span className="sidebar-group-label">Upcoming</span>
            <ul className="sidebar-trips">
              {upcoming.map((t) => (
                <TripRow
                  key={t.id}
                  trip={t}
                  current={t.id === activeTripId}
                  sections={sections}
                  pathname={pathname}
                  backlogCount={backlogCount}
                />
              ))}
            </ul>
          </>
        )}

        {past.length > 0 && (
          <>
            <button
              type="button"
              className="sidebar-past-toggle"
              aria-expanded={showPast}
              onClick={() => setPastOpen((o) => !o)}
            >
              Past trips ({past.length})
              <Icon name={showPast ? 'chevron-down' : 'chevron-right'} size={14} />
            </button>
            {showPast && (
              <ul className="sidebar-trips">
                {past.map((t) => (
                  <TripRow
                    key={t.id}
                    trip={t}
                    current={t.id === activeTripId}
                    sections={sections}
                    pathname={pathname}
                    backlogCount={backlogCount}
                  />
                ))}
              </ul>
            )}
          </>
        )}

        <Link to="/trips/new" className="sidebar-new-trip">
          <Icon name="plus" size={16} /> New trip
        </Link>
      </div>

      <div className="sidebar-footer">
        <Link
          to="/profile"
          className="sidebar-profile"
          aria-current={pathname.startsWith('/profile') ? 'page' : undefined}
        >
          <span className="sidebar-avatar" aria-hidden="true">
            {initial}
          </span>
          <span className="sidebar-profile-name">{userName ?? 'Profile'}</span>
          <span className="visually-hidden">— profile and settings</span>
        </Link>
        {onSignOut && (
          <button type="button" className="sidebar-signout" onClick={onSignOut}>
            Sign out
          </button>
        )}
      </div>
    </nav>
  )
}
