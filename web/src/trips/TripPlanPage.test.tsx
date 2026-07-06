import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
  }
})

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
})

async function daysNav() {
  return within(await screen.findByRole('navigation', { name: 'Days' }))
}

describe('TripPlanPage', () => {
  it('shows the Trip plan heading', async () => {
    renderPage()
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Trip plan' })).toBeInTheDocument(),
    )
  })

  it('lists every day plus a Whole trip option and the ideas backlog', async () => {
    renderPage()
    const nav = await daysNav()
    expect(nav.getByRole('button', { name: /whole trip/i })).toBeInTheDocument()
    expect(nav.getByRole('button', { name: /day 1/i })).toBeInTheDocument()
    expect(nav.getByRole('button', { name: /day 2/i })).toBeInTheDocument()
    expect(nav.getByRole('button', { name: /day 3/i })).toBeInTheDocument()
    expect(nav.getByRole('link', { name: /ideas backlog/i })).toBeInTheDocument()
  })

  it('captions days by plan status', async () => {
    renderPage()
    const nav = await daysNav()
    expect(within(nav.getByRole('button', { name: /day 1/i })).getByText('1 item')).toBeVisible()
    expect(
      within(nav.getByRole('button', { name: /day 2/i })).getByText('Nothing planned yet'),
    ).toBeVisible()
  })

  it('defaults to the whole-trip stack showing every day planner', async () => {
    renderPage()
    // Each day renders its own Planning section, titled by day.
    expect(await screen.findByText('Visit the castle')).toBeInTheDocument()
    const wholeTrip = (await daysNav()).getByRole('button', { name: /whole trip/i })
    expect(wholeTrip).toHaveAttribute('aria-pressed', 'true')
  })

  it('opens a single day planner when a day is selected', async () => {
    const user = userEvent.setup()
    renderPage()
    const nav = await daysNav()
    await user.click(nav.getByRole('button', { name: /day 1/i }))
    // The day's planner exposes the quick-add composer.
    expect(await screen.findByRole('textbox', { name: 'Title' })).toBeInTheDocument()
    expect(screen.getByText('Visit the castle')).toBeInTheDocument()
  })
})
