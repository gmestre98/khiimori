import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { TripPlanPage } from './TripPlanPage'
import { TripShellRoute } from './TripShell'
import * as api from '../lib/api'
import type { Day, PlanItem, Trip } from '../lib/api'
import { AuthContext, type AuthContextValue } from '../auth/AuthContext'

const mockTrip: Trip = {
  id: 'trip-1',
  owner_id: 'user-owner',
  name: 'Test Trip',
  destinations: [],
  start_date: '2026-06-01',
  end_date: '2026-06-03',
  base_currency: 'EUR',
  cover: '',
  status: 'active',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  is_current: false,
}

const ownerProfile: api.Profile = {
  id: 'user-owner',
  name: 'Owner',
  email: 'owner@example.com',
  avatar: '',
  home_base: '',
  theme: 'light',
  default_currency: 'EUR',
  is_admin: false,
}

const DATES = ['2026-06-01', '2026-06-02', '2026-06-03']

function makeItem(dayId: string, title: string): PlanItem {
  return {
    id: `item-${dayId}`,
    trip_id: 'trip-1',
    day_id: dayId,
    title,
    sort_order: 0,
    status: 'planned',
  }
}

function makeDay(date: string, index: number): Day {
  const id = `day-${index}`
  // Day 1 has a planned item; Days 2 and 3 are empty.
  return {
    id,
    trip_id: 'trip-1',
    date,
    index,
    notes: '',
    stays: [],
    plan_items: index === 0 ? [makeItem(id, 'Visit the castle')] : [],
  }
}

vi.mock('../lib/api', async (importOriginal) => {
  const orig = await importOriginal<typeof api>()
  return {
    ...orig,
    fetchTrips: vi.fn(),
    fetchDay: vi.fn(),
    movePlanItem: vi.fn(),
    createStay: vi.fn(),
    // The stay location uses the shared LocationField (live geocode + Places);
    // stub both so the test doesn't hit the network.
    geocodeLocation: vi.fn().mockResolvedValue(null),
    fetchAutocomplete: vi.fn().mockResolvedValue([]),
    // Journal reads: the per-day editor and the whole-trip travelogue both fetch
    // entries + photos. Stub so tests don't hit the network.
    fetchJournalEntry: vi.fn(),
    listPhotos: vi.fn().mockResolvedValue([]),
  }
})

vi.mock('../lib/mutationQueue', () => ({
  enqueue: vi.fn().mockResolvedValue(undefined),
}))

function makeAuthCtx(profile: api.Profile): AuthContextValue {
  return {
    status: 'authenticated',
    user: profile,
    signIn: vi.fn(),
    signOut: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn().mockResolvedValue(undefined),
    setProfile: vi.fn(),
  }
}

function renderPage() {
  return render(
    <AuthContext.Provider value={makeAuthCtx(ownerProfile)}>
      <MemoryRouter
        initialEntries={[{ pathname: '/trips/trip-1/plan', state: { trip: mockTrip } }]}
      >
        <Routes>
          <Route path="/trips/:tripId" element={<TripShellRoute />}>
            <Route path="plan" element={<TripPlanPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

beforeEach(() => {
  vi.mocked(api.fetchTrips).mockResolvedValue({ current: [], upcoming: [], past: [] })
  vi.mocked(api.fetchDay).mockImplementation(async (_tripId, date) =>
    makeDay(date, DATES.indexOf(date)),
  )
  // Default: no journal entry on any day (travelogue empty, editor blank).
  vi.mocked(api.fetchJournalEntry).mockRejectedValue(new api.JournalEntryNotFoundError())
  vi.mocked(api.listPhotos).mockResolvedValue([])
  // The whole-trip stack persists which day cards are open; start each test from
  // the cold default (today, or day 1 for a trip outside today's range).
  localStorage.clear()
})

describe('TripPlanPage', () => {
  it('lists every day exactly once, as links into the day', async () => {
    renderPage()
    const list = await screen.findByRole('list', { name: 'Days' })
    const links = within(list).getAllByRole('link')
    expect(links).toHaveLength(3)
    expect(links[0]).toHaveAttribute('href', '/trips/trip-1/days/2026-06-01')
    // No second "whole trip" accordion repeating the days.
    expect(screen.queryByRole('button', { name: /whole trip/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /expand all/i })).not.toBeInTheDocument()
  })

  it('summarises planned days and marks empty ones “Nothing planned”', async () => {
    renderPage()
    const list = await screen.findByRole('list', { name: 'Days' })
    const [day1, day2] = within(list).getAllByRole('link')
    expect(within(day1).getByText('Visit the castle')).toBeInTheDocument()
    expect(within(day2).getByText('Nothing planned')).toBeInTheDocument()
    expect(day2).toHaveAccessibleName(/nothing planned/)
  })

  it('shows planning progress (days with plans / total)', async () => {
    renderPage()
    expect(await screen.findByText('1 of 3 days have plans')).toBeInTheDocument()
    expect(screen.getByText('2 empty')).toBeInTheDocument()
  })

  it('links to the backlog', async () => {
    renderPage()
    const link = await screen.findByRole('link', { name: /backlog/i })
    expect(link).toHaveAttribute('href', '/trips/trip-1/backlog')
  })
})
