import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { TripJournalPage } from './TripJournalPage'
import { TripShellRoute } from './TripShell'
import * as api from '../lib/api'
import type { Day, JournalEntry, Photo, Trip } from '../lib/api'
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

function makeDay(date: string, index: number): Day {
  return {
    id: `day-${index}`,
    trip_id: 'trip-1',
    date,
    index,
    notes: '',
    stays: [],
    plan_items: [],
  }
}

function makeEntry(dayId: string, body: string): JournalEntry {
  return {
    id: `entry-${dayId}`,
    day_id: dayId,
    author_id: 'user-owner',
    body,
    rating: 4,
    weather: 'sunny',
    mood: 'good',
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
  }
}

function makePhoto(dayId: string): Photo {
  return {
    id: `photo-${dayId}`,
    journal_entry_id: `entry-${dayId}`,
    storage_url: `https://cdn.example/${dayId}.jpg`,
    thumbnail_url: `https://cdn.example/${dayId}-thumb.jpg`,
    caption: 'A view',
    size_bytes: 1000,
    created_at: '2026-06-01T00:00:00Z',
  }
}

vi.mock('../lib/api', async (importOriginal) => {
  const orig = await importOriginal<typeof api>()
  return {
    ...orig,
    fetchTrips: vi.fn(),
    fetchDay: vi.fn(),
    fetchJournalEntry: vi.fn(),
    listPhotos: vi.fn(),
    fetchTripUsage: vi.fn(),
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
        initialEntries={[{ pathname: '/trips/trip-1/journal', state: { trip: mockTrip } }]}
      >
        <Routes>
          <Route path="/trips/:tripId" element={<TripShellRoute />}>
            <Route path="journal" element={<TripJournalPage />} />
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
  // Day 1 has an entry with a photo; Days 2 and 3 have none.
  vi.mocked(api.fetchJournalEntry).mockImplementation(async (_tripId, dayId) => {
    if (dayId === 'day-0') return makeEntry(dayId, 'Landed in Lisbon.')
    throw new api.JournalEntryNotFoundError()
  })
  vi.mocked(api.listPhotos).mockImplementation(async (_tripId, dayId) =>
    dayId === 'day-0' ? [makePhoto(dayId)] : [],
  )
  vi.mocked(api.fetchTripUsage).mockResolvedValue({
    used_bytes: 1000,
    cap_bytes: 1_000_000_000,
    near_cap: false,
    used_pct: 0,
  })
})

async function daysNav() {
  return within(await screen.findByRole('navigation', { name: 'Days' }))
}

describe('TripJournalPage', () => {
  it('shows the Trip journal heading', async () => {
    renderPage()
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Trip journal' })).toBeInTheDocument(),
    )
  })

  it('lists every day plus a Whole trip option', async () => {
    renderPage()
    const nav = await daysNav()
    expect(nav.getByRole('button', { name: /whole trip/i })).toBeInTheDocument()
    expect(nav.getByRole('button', { name: /day 1/i })).toBeInTheDocument()
    expect(nav.getByRole('button', { name: /day 2/i })).toBeInTheDocument()
    expect(nav.getByRole('button', { name: /day 3/i })).toBeInTheDocument()
  })

  it('captions days by journal status', async () => {
    renderPage()
    const nav = await daysNav()
    // Day 1 has an entry (sunny + 1 photo); Days 2/3 have none.
    expect(within(nav.getByRole('button', { name: /day 1/i })).getByText(/1 photo/i)).toBeVisible()
    expect(
      within(nav.getByRole('button', { name: /day 2/i })).getByText('No entry yet'),
    ).toBeVisible()
  })

  it('defaults to the whole-trip travelogue and shows entry bodies', async () => {
    renderPage()
    // Day 1's body appears in the read-only feed; empty days are omitted.
    expect(await screen.findByText('Landed in Lisbon.')).toBeInTheDocument()
    const wholeTrip = (await daysNav()).getByRole('button', { name: /whole trip/i })
    expect(wholeTrip).toHaveAttribute('aria-pressed', 'true')
  })

  it('opens the day editor when a day is selected', async () => {
    const user = userEvent.setup()
    renderPage()
    const nav = await daysNav()
    await user.click(nav.getByRole('button', { name: /day 1/i }))
    // The editor exposes the journal textarea.
    expect(await screen.findByRole('textbox', { name: 'Journal entry' })).toBeInTheDocument()
  })
})
