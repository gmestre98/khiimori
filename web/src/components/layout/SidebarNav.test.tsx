import { afterEach, describe, it, expect, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { SidebarNav } from './SidebarNav'
import type { Trip, TripsResponse } from '../../lib/api'
import type { TripSwitcher } from '../../lib/useSelectedTrip'

afterEach(cleanup)

function trip(id: string, name: string): Trip {
  return {
    id,
    owner_id: 'u',
    name,
    destinations: [],
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

const japan = trip('japan', 'Japan — Spring 2026')
const portugal = trip('portugal', 'Portugal Roadtrip')
const morocco = trip('morocco', 'Morocco')
const trips: TripsResponse = { current: [japan], upcoming: [portugal], past: [morocco] }

function switcher(): TripSwitcher {
  return { trips, selectedTrip: japan, selectTrip: vi.fn() }
}

function renderNav(path: string, activeTripId: string | null, backlogCount: number | null = 3) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SidebarNav
        tripSwitcher={switcher()}
        activeTripId={activeTripId}
        backlogCount={backlogCount}
        userName="Test User"
        onSignOut={() => {}}
      />
    </MemoryRouter>,
  )
}

describe('SidebarNav', () => {
  it('lists upcoming trips and a collapsed Past trips (n) group', () => {
    renderNav('/', null)
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    expect(within(nav).getByRole('link', { name: /Japan — Spring 2026/ })).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: /Portugal Roadtrip/ })).toBeInTheDocument()
    expect(within(nav).queryByRole('link', { name: /Morocco/ })).not.toBeInTheDocument()
    const past = within(nav).getByRole('button', { name: /Past trips \(1\)/ })
    expect(past).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(past)
    expect(within(nav).getByRole('link', { name: /Morocco/ })).toBeInTheDocument()
  })

  it('nests the open trip’s sections under it, with the backlog count', () => {
    renderNav('/trips/japan/plan', 'japan', 7)
    const sections = screen.getByRole('list', { name: 'Japan — Spring 2026 sections' })
    const names = within(sections)
      .getAllByRole('link')
      .map((l) => l.textContent)
    expect(names).toEqual(['Days', 'Map & stays', 'Journal', 'Money', 'Prep', 'Backlog7'])
    expect(within(sections).getByRole('link', { name: /Map & stays/ })).toHaveAttribute(
      'href',
      '/trips/japan/map',
    )
    expect(within(sections).getByRole('link', { name: 'Money' })).toHaveAttribute(
      'href',
      '/trips/japan/budget',
    )
    expect(within(sections).getByRole('link', { name: 'Prep' })).toHaveAttribute(
      'href',
      '/trips/japan/packing',
    )
  })

  it('marks the current section with aria-current (Days stays lit on a single day)', () => {
    renderNav('/trips/japan/days/2026-07-02', 'japan')
    const sections = screen.getByRole('list', { name: 'Japan — Spring 2026 sections' })
    expect(within(sections).getByRole('link', { name: 'Days' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(sections).getByRole('link', { name: 'Journal' })).not.toHaveAttribute(
      'aria-current',
    )
  })

  it('marks Money active on the budget route and only that section', () => {
    renderNav('/trips/japan/budget', 'japan')
    const current = screen
      .getByRole('list', { name: 'Japan — Spring 2026 sections' })
      .querySelectorAll('[aria-current="page"]')
    expect(current).toHaveLength(1)
    expect(current[0]).toHaveTextContent('Money')
  })

  it('opens the Past group automatically when the open trip is a past one', () => {
    renderNav('/trips/morocco/plan', 'morocco')
    expect(screen.getByRole('list', { name: 'Morocco sections' })).toBeInTheDocument()
  })

  it('has no top-level duplicate destinations — only trips, new trip and profile', () => {
    renderNav('/trips/japan/map', 'japan')
    expect(screen.getByRole('link', { name: /New trip/ })).toHaveAttribute('href', '/trips/new')
    expect(screen.getByRole('link', { name: /profile and settings/i })).toHaveAttribute(
      'href',
      '/profile',
    )
    // Each section appears exactly once.
    expect(screen.getAllByRole('link', { name: 'Journal' })).toHaveLength(1)
  })

  it('renders the sign-out button in the footer', () => {
    renderNav('/', null)
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
  })
})
