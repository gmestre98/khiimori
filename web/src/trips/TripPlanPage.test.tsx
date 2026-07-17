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
})

async function daysNav() {
  return within(await screen.findByRole('navigation', { name: 'Days' }))
}

describe('TripPlanPage', () => {
  it('shows the day-by-day heading', async () => {
    renderPage()
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Your trip, day by day' })).toBeInTheDocument(),
    )
  })

  it('reveals the journal below the plan when a day is selected', async () => {
    const user = userEvent.setup()
    renderPage()
    const nav = await daysNav()
    // The whole-trip view shows the travelogue, not the per-day Journal editor;
    // selecting a day adds the editor.
    expect(screen.queryByRole('region', { name: 'Journal' })).not.toBeInTheDocument()
    await user.click(nav.getByRole('button', { name: /day 1/i }))
    expect(await screen.findByRole('region', { name: 'Journal' })).toBeInTheDocument()
  })

  it('shows the travelogue with journal entries in the whole-trip view', async () => {
    vi.mocked(api.fetchJournalEntry).mockImplementation(async (_tripId, dayId) => {
      if (dayId !== 'day-0') throw new api.JournalEntryNotFoundError()
      return {
        id: 'e1',
        day_id: 'day-0',
        author_id: 'user-owner',
        body: 'Best day of the trip — sunset kayak.',
        rating: 5,
        weather: 'sunny',
        mood: 'happy',
        created_at: '2026-06-01T00:00:00Z',
        updated_at: '2026-06-01T00:00:00Z',
      }
    })
    renderPage()
    // Whole-trip is the default view; the travelogue stitches in written days.
    const travelogue = await screen.findByRole('region', { name: 'Travelogue' })
    expect(
      await within(travelogue).findByText('Best day of the trip — sunset kayak.'),
    ).toBeInTheDocument()
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

  it('adds a two-night stay to every night it covers, not just the first day', async () => {
    const user = userEvent.setup()
    vi.mocked(api.createStay).mockResolvedValue({
      id: 'stay-1',
      trip_id: 'trip-1',
      name: 'Grand Hotel',
      check_in: '2026-06-01',
      check_out: '2026-06-03',
      paid: false,
    })

    renderPage()
    // Whole-trip stack: every day shows an add-stay affordance. Open day 1's.
    const addButtons = await screen.findAllByRole('button', {
      name: /add where you're staying/i,
    })
    await user.click(addButtons[0])

    await user.type(screen.getByLabelText('Name'), 'Grand Hotel')
    // Push check-out out to the 3rd so the stay spans nights of the 1st and 2nd.
    const checkOut = screen.getByLabelText('Check out') as HTMLInputElement
    await user.clear(checkOut)
    await user.type(checkOut, '2026-06-03')
    await user.click(screen.getByRole('button', { name: 'Add stay' }))

    await waitFor(() => expect(api.createStay).toHaveBeenCalledTimes(1))
    // The stay now appears on both covered days (day 1 and day 2), not only day 1.
    await waitFor(() => expect(screen.getAllByText('Grand Hotel')).toHaveLength(2))
  })

  it('moves an item to another day in place — target day and rail update without a reload', async () => {
    const user = userEvent.setup()
    // Moving online resolves the target day, then persists the move.
    vi.mocked(api.movePlanItem).mockResolvedValue({
      ...makeItem('day-0', 'Visit the castle'),
      day_id: 'day-1',
    })
    renderPage()

    const nav = await daysNav()
    // Before: day 1 has the item, day 2 is empty.
    expect(within(nav.getByRole('button', { name: /day 1/i })).getByText('1 item')).toBeVisible()
    expect(
      within(nav.getByRole('button', { name: /day 2/i })).getByText('Nothing planned yet'),
    ).toBeVisible()

    // Move the item off day 1 onto day 2 (2026-06-02). Secondary actions live
    // under the row's ⋯ menu.
    await user.click(
      await screen.findByRole('button', { name: /More actions for Visit the castle/ }),
    )
    await user.click(
      await screen.findByRole('button', { name: /Move Visit the castle to another day/ }),
    )
    await user.selectOptions(screen.getByRole('combobox', { name: 'Target day' }), '2026-06-02')
    await user.click(screen.getByRole('button', { name: 'Move' }))

    await waitFor(() =>
      expect(api.movePlanItem).toHaveBeenCalledWith('trip-1', 'item-day-0', 'day-1'),
    )

    // After: the rail counts flip — day 1 empties, day 2 gains the item — with no
    // reload and no extra fetchDay for the target day.
    const navAfter = await daysNav()
    await waitFor(() =>
      expect(
        within(navAfter.getByRole('button', { name: /day 1/i })).getByText('Nothing planned yet'),
      ).toBeVisible(),
    )
    expect(
      within(navAfter.getByRole('button', { name: /day 2/i })).getByText('1 item'),
    ).toBeVisible()
    // The item still shows in the whole-trip stack (now under day 2).
    expect(screen.getByText('Visit the castle')).toBeInTheDocument()
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
