import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { TripMapPage } from './TripMapPage'
import { TripShellRoute } from './TripShell'
import * as api from '../lib/api'
import type { Day, Trip } from '../lib/api'
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

// makeDay builds a minimal day with one located plan item unless overridden.
function makeDay(date: string, index: number, location: string | null): Day {
  return {
    id: `day-${index}`,
    trip_id: 'trip-1',
    date,
    index,
    notes: '',
    stays: [],
    plan_items: location
      ? [
          {
            id: `item-${index}`,
            trip_id: 'trip-1',
            title: `Stop ${index}`,
            location,
            sort_order: 0,
            status: 'confirmed',
          },
        ]
      : [],
  }
}

vi.mock('../lib/api', async (importOriginal) => {
  const orig = await importOriginal<typeof api>()
  return {
    ...orig,
    fetchTrips: vi.fn(),
    fetchDay: vi.fn(),
    fetchDayRoute: vi.fn(),
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
      <MemoryRouter initialEntries={[{ pathname: '/trips/trip-1/map', state: { trip: mockTrip } }]}>
        <Routes>
          <Route path="/trips/:tripId" element={<TripShellRoute />}>
            <Route path="map" element={<TripMapPage />} />
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
  // Day 1 and Day 2 have a located stop; Day 3 has none.
  vi.mocked(api.fetchDay).mockImplementation(async (_tripId, date) => {
    const idx = ['2026-06-01', '2026-06-02', '2026-06-03'].indexOf(date)
    return makeDay(date, idx, idx < 2 ? `City ${idx}` : null)
  })
  vi.mocked(api.fetchDayRoute).mockResolvedValue({ waypoints: [{ lat: 48.85, lng: 2.35 }] })
})

describe('TripMapPage', () => {
  it('shows the Trip map heading', async () => {
    renderPage()
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Trip map' })).toBeInTheDocument(),
    )
  })

  // The day rows live in the "Days" nav; scope queries there since map marker
  // tooltips ("Day 1 · Stop 0") would otherwise collide by accessible name.
  async function daysNav() {
    return within(await screen.findByRole('navigation', { name: 'Days' }))
  }

  it('lists every day plus an All days option', async () => {
    renderPage()
    const nav = await daysNav()
    expect(nav.getByRole('button', { name: /all days/i })).toBeInTheDocument()
    expect(nav.getByRole('button', { name: /day 1/i })).toBeInTheDocument()
    expect(nav.getByRole('button', { name: /day 2/i })).toBeInTheDocument()
    expect(nav.getByRole('button', { name: /day 3/i })).toBeInTheDocument()
  })

  it('disables days with no places and labels them', async () => {
    renderPage()
    const nav = await daysNav()
    const day3 = nav.getByRole('button', { name: /day 3/i })
    expect(day3).toBeDisabled()
    expect(within(day3).getByText('No places yet')).toBeInTheDocument()
  })

  it('toggles a day on its row click and off on a second click', async () => {
    const user = userEvent.setup()
    renderPage()
    const nav = await daysNav()
    const day1 = nav.getByRole('button', { name: /day 1/i })
    expect(day1).toHaveAttribute('aria-pressed', 'false')
    await user.click(day1)
    expect(day1).toHaveAttribute('aria-pressed', 'true')
    await user.click(day1)
    expect(day1).toHaveAttribute('aria-pressed', 'false')
  })

  it('supports selecting multiple days at once', async () => {
    const user = userEvent.setup()
    renderPage()
    const nav = await daysNav()
    const allDays = nav.getByRole('button', { name: /all days/i })
    const day1 = nav.getByRole('button', { name: /day 1/i })
    const day2 = nav.getByRole('button', { name: /day 2/i })
    // Empty selection = all days.
    expect(allDays).toHaveAttribute('aria-pressed', 'true')
    await user.click(day1)
    await user.click(day2)
    expect(day1).toHaveAttribute('aria-pressed', 'true')
    expect(day2).toHaveAttribute('aria-pressed', 'true')
    expect(allDays).toHaveAttribute('aria-pressed', 'false')
    // "All days" clears the multi-selection.
    await user.click(allDays)
    expect(day1).toHaveAttribute('aria-pressed', 'false')
    expect(day2).toHaveAttribute('aria-pressed', 'false')
    expect(allDays).toHaveAttribute('aria-pressed', 'true')
  })

  it('renders the map surface with day pins', async () => {
    renderPage()
    // Global test mock renders MapContainer as a div and Marker as a button.
    await waitFor(() => expect(screen.getByLabelText('Trip map — all days')).toBeInTheDocument())
    // Two located days → two markers.
    expect(screen.getAllByTestId('map-marker')).toHaveLength(2)
  })
})
