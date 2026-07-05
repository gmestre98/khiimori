import { afterEach, describe, it, expect, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { SidebarNav } from './SidebarNav'
import { SIDEBAR_NAV_ITEMS, SIDEBAR_SECONDARY_ITEMS, buildSidebarNavItems } from './navItems'
import type { Trip, TripsResponse } from '../../lib/api'
import type { TripSwitcher } from '../../lib/useSelectedTrip'

afterEach(cleanup)

// Minimal Trip factory — only the fields the switcher reads matter.
function trip(id: string, name: string, destinations: string[] = []): Trip {
  return {
    id,
    owner_id: 'u',
    name,
    destinations,
    start_date: '2026-07-01',
    end_date: '2026-07-05',
    base_currency: 'EUR',
    cover: '',
    status: 'planning',
    created_at: '',
    updated_at: '',
    is_current: false,
  }
}

const japan = trip('japan', 'Japan — Spring 2026', ['Tokyo'])
const portugal = trip('portugal', 'Portugal Roadtrip', ['Lisbon'])
const morocco = trip('morocco', 'Morocco', ['Fez'])

const tripsResponse: TripsResponse = {
  current: [japan],
  upcoming: [portugal],
  past: [morocco],
}

function renderNav(path = '/', items = SIDEBAR_NAV_ITEMS) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SidebarNav
        items={items}
        secondaryItems={SIDEBAR_SECONDARY_ITEMS}
        userName="Test User"
        userMeta="EUR · Lisbon"
        onSignOut={() => {}}
      />
    </MemoryRouter>,
  )
}

describe('SidebarNav', () => {
  it('renders a Primary navigation landmark with all destinations', () => {
    renderNav()
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /trips/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /profile/i })).toBeInTheDocument()
  })

  it('marks the active destination', () => {
    renderNav('/profile')
    expect(screen.getByRole('link', { name: /profile/i })).toHaveClass('sidebar-nav-link--active')
    // Home link must not be active on a sub-route (end-matching for "/").
    expect(screen.getByRole('link', { name: /trips/i })).not.toHaveClass('sidebar-nav-link--active')
  })

  it('highlights only the most-specific destination on a nested trip route', () => {
    // On /trips/abc/budget, the parent Map/Journal links (/trips/abc) must not
    // stay highlighted alongside Budget — only Budget should be active.
    renderNav('/trips/abc/budget', buildSidebarNavItems('abc'))
    expect(screen.getByRole('link', { name: /budget/i })).toHaveClass('sidebar-nav-link--active')
    expect(screen.getByRole('link', { name: /^map$/i })).not.toHaveClass('sidebar-nav-link--active')
    expect(screen.getByRole('link', { name: /journal/i })).not.toHaveClass(
      'sidebar-nav-link--active',
    )
    expect(screen.getByRole('link', { name: /sharing/i })).not.toHaveClass(
      'sidebar-nav-link--active',
    )
  })

  it('highlights no trip facet on the bare day route', () => {
    // Map, Journal, and Budget each have their own subtab route now, so none of
    // them is active on the day view itself.
    renderNav('/trips/abc/days/2026-07-02', buildSidebarNavItems('abc'))
    expect(screen.getByRole('link', { name: /journal/i })).not.toHaveClass(
      'sidebar-nav-link--active',
    )
    expect(screen.getByRole('link', { name: /^map$/i })).not.toHaveClass('sidebar-nav-link--active')
    expect(screen.getByRole('link', { name: /budget/i })).not.toHaveClass(
      'sidebar-nav-link--active',
    )
  })

  it('highlights Map on its own trip subtab route', () => {
    renderNav('/trips/abc/map', buildSidebarNavItems('abc'))
    expect(screen.getByRole('link', { name: /^map$/i })).toHaveClass('sidebar-nav-link--active')
    expect(screen.getByRole('link', { name: /journal/i })).not.toHaveClass(
      'sidebar-nav-link--active',
    )
  })

  it('highlights Journal on its own trip subtab route', () => {
    renderNav('/trips/abc/journal', buildSidebarNavItems('abc'))
    expect(screen.getByRole('link', { name: /journal/i })).toHaveClass('sidebar-nav-link--active')
    expect(screen.getByRole('link', { name: /^map$/i })).not.toHaveClass('sidebar-nav-link--active')
    expect(screen.getByRole('link', { name: /budget/i })).not.toHaveClass(
      'sidebar-nav-link--active',
    )
  })

  it('renders the sign-out button in the user footer', () => {
    renderNav()
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument()
  })
})

describe('SidebarNav trip switcher', () => {
  function renderWithSwitcher(
    path = '/',
    overrides: Partial<TripSwitcher> = {},
  ): { selectTrip: ReturnType<typeof vi.fn> } {
    const selectTrip = vi.fn()
    const switcher: TripSwitcher = {
      trips: tripsResponse,
      selectedTrip: japan,
      selectTrip,
      ...overrides,
    }
    render(
      <MemoryRouter initialEntries={[path]}>
        <SidebarNav
          items={buildSidebarNavItems(switcher.selectedTrip?.id ?? null)}
          secondaryItems={SIDEBAR_SECONDARY_ITEMS}
          tripSwitcher={switcher}
          userName="Test User"
          onSignOut={() => {}}
        />
      </MemoryRouter>,
    )
    return { selectTrip }
  }

  it('renders a Trip tab that opens the selected trip', () => {
    renderWithSwitcher()
    const link = screen.getByRole('link', { name: /Japan — Spring 2026/i })
    expect(link).toHaveAttribute('href', '/trips/japan')
  })

  it('hides the tab when there is no selected trip', () => {
    renderWithSwitcher('/', { selectedTrip: null })
    expect(screen.queryByRole('button', { name: /switch trip/i })).not.toBeInTheDocument()
  })

  it('opens a dropdown that groups current & upcoming apart from past', () => {
    renderWithSwitcher()
    fireEvent.click(screen.getByRole('button', { name: /switch trip/i }))
    const listbox = screen.getByRole('listbox', { name: /select a trip/i })
    // Current + upcoming buckets are merged into one group, past kept separate.
    expect(within(listbox).getByText('Current & upcoming')).toBeInTheDocument()
    expect(within(listbox).getByText('Past')).toBeInTheDocument()
    expect(within(listbox).getByRole('option', { name: /Portugal Roadtrip/ })).toBeInTheDocument()
    expect(within(listbox).getByRole('option', { name: /Morocco/ })).toBeInTheDocument()
    // The selected trip is marked.
    const selected = within(listbox).getByRole('option', { name: /Japan — Spring 2026/ })
    expect(selected).toHaveAttribute('aria-selected', 'true')
  })

  it('remembers the pick via selectTrip when an option is chosen', () => {
    const { selectTrip } = renderWithSwitcher()
    fireEvent.click(screen.getByRole('button', { name: /switch trip/i }))
    fireEvent.click(screen.getByRole('option', { name: /Morocco/ }))
    expect(selectTrip).toHaveBeenCalledWith('morocco')
  })

  it('highlights the Trip tab on the selected trip day view', () => {
    renderWithSwitcher('/trips/japan/days/2026-07-02')
    // The row wrapper carries the active class (the link shares its background).
    const link = screen.getByRole('link', { name: /Japan — Spring 2026/i })
    expect(link.closest('.trip-switcher-row')).toHaveClass('trip-switcher-row--active')
  })
})
