import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { TripShellRoute } from './TripShell'
import { DayView } from './DayView'
import * as api from '../lib/api'
import type { Trip } from '../lib/api'

const mockTrip: Trip = {
  id: 'trip-1',
  owner_id: 'user-1',
  name: 'Test Trip',
  destinations: ['Paris', 'London'],
  start_date: '2026-06-01',
  end_date: '2026-06-05',
  base_currency: 'EUR',
  cover: '',
  status: 'active',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  is_current: false,
}

function makeMockDay(date: string, index: number): api.Day {
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

const mockDay = makeMockDay('2026-06-01', 0)

vi.mock('../lib/api', async (importOriginal) => {
  const orig = await importOriginal<typeof api>()
  return {
    ...orig,
    fetchTrips: vi.fn(),
    fetchDay: vi.fn(),
  }
})

function renderShellAtDay(date: string, trip?: Trip) {
  return render(
    <MemoryRouter
      initialEntries={[
        { pathname: `/trips/trip-1/days/${date}`, state: { trip: trip ?? mockTrip } },
      ]}
    >
      <Routes>
        <Route path="/trips/:tripId" element={<TripShellRoute />}>
          <Route path="days/:date" element={<DayView />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

beforeEach(() => {
  vi.mocked(api.fetchDay).mockResolvedValue(mockDay)
  vi.mocked(api.fetchTrips).mockResolvedValue({ current: [], upcoming: [], past: [] })
})

describe('TripShell', () => {
  it('renders the trip name in the header', async () => {
    renderShellAtDay('2026-06-01')
    await waitFor(() => expect(screen.getByText('Test Trip')).toBeInTheDocument())
  })

  it('renders destinations in the header', async () => {
    renderShellAtDay('2026-06-01')
    await waitFor(() =>
      expect(screen.getByText('1 Jun – 5 Jun · 5 days · Paris · London')).toBeInTheDocument(),
    )
  })

  it('renders back link to trips dashboard', async () => {
    renderShellAtDay('2026-06-01')
    await waitFor(() => {
      const link = screen.getByRole('link', { name: /back to trips/i })
      expect(link).toHaveAttribute('href', '/')
    })
  })

  it('renders edit link for the trip', async () => {
    const { container } = renderShellAtDay('2026-06-01')
    // Edit now lives in the "⋯" overflow menu (a collapsed <details>, so its
    // accessible name is pruned in jsdom). Assert the link + target directly.
    await waitFor(() => {
      const link = container.querySelector('a[href="/trips/trip-1/edit"]')
      expect(link).toBeTruthy()
      expect(link).toHaveTextContent(/edit/i)
    })
  })
})

describe('Trip header', () => {
  it('has a Share link to the sharing page and no top tab bar', async () => {
    renderShellAtDay('2026-06-01')
    await waitFor(() =>
      expect(screen.getByRole('link', { name: /share test trip/i })).toHaveAttribute(
        'href',
        '/trips/trip-1/sharing',
      ),
    )
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  })

  it('shows the day strip with every day, the open one current, linking to each day', async () => {
    renderShellAtDay('2026-06-02')
    const strip = await screen.findByRole('region', { name: 'Days at a glance' })
    const cells = within(strip).getAllByRole('link')
    expect(cells).toHaveLength(5)
    expect(cells[1]).toHaveAttribute('aria-current', 'page')
    expect(cells[3]).toHaveAttribute('href', '/trips/trip-1/days/2026-06-04')
    // Fixed-width cells in a scrolling row: no width-fitting grid template.
    expect(within(strip).getByRole('list')).not.toHaveAttribute('style')
    expect(within(strip).getByRole('button', { name: 'Earlier days' })).toBeInTheDocument()
    expect(within(strip).getByRole('button', { name: 'Later days' })).toBeInTheDocument()
  })

  it("links the strip to each day's journal when a journal is open", async () => {
    render(
      <MemoryRouter
        initialEntries={[
          { pathname: '/trips/trip-1/journal/2026-06-03', state: { trip: mockTrip } },
        ]}
      >
        <Routes>
          <Route path="/trips/:tripId" element={<TripShellRoute />}>
            <Route path="journal/:date" element={<DayView variant="journal" />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )
    const strip = await screen.findByRole('region', { name: 'Days at a glance' })
    const cells = within(strip).getAllByRole('link')
    expect(cells[2]).toHaveAttribute('aria-current', 'page')
    expect(cells[0]).toHaveAttribute('href', '/trips/trip-1/journal/2026-06-01')
  })
})

describe('Day navigation', () => {
  it('disables Previous on the first day', async () => {
    renderShellAtDay('2026-06-01')
    const nav = await screen.findByRole('navigation', { name: 'Day navigation' })
    expect(within(nav).getByLabelText('Previous day')).toHaveAttribute('aria-disabled', 'true')
  })

  it('disables Next on the last day', async () => {
    renderShellAtDay('2026-06-05')
    const nav = await screen.findByRole('navigation', { name: 'Day navigation' })
    expect(within(nav).getByLabelText('Next day')).toHaveAttribute('aria-disabled', 'true')
  })

  it('links Next and Previous to the neighbouring days', async () => {
    renderShellAtDay('2026-06-03')
    const nav = await screen.findByRole('navigation', { name: 'Day navigation' })
    expect(within(nav).getByRole('link', { name: /next day/i })).toHaveAttribute(
      'href',
      '/trips/trip-1/days/2026-06-04',
    )
    expect(within(nav).getByRole('link', { name: /previous day/i })).toHaveAttribute(
      'href',
      '/trips/trip-1/days/2026-06-02',
    )
    expect(within(nav).getByText('Day 3 / 5')).toBeInTheDocument()
  })
})

describe('DayView', () => {
  it('shows the day number and date', async () => {
    vi.mocked(api.fetchDay).mockResolvedValue(makeMockDay('2026-06-03', 2))
    renderShellAtDay('2026-06-03')
    // Date box (big day number) + place heading.
    expect(await screen.findByRole('heading', { level: 1, name: 'Day 3' })).toBeInTheDocument()
    expect(screen.getByText('Day 3 / 5')).toBeInTheDocument()
  })

  it('renders the plan and map on desktop; journal and money live in their own tabs', async () => {
    renderShellAtDay('2026-06-01')
    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Planning' })).toBeInTheDocument()
      expect(screen.getByRole('region', { name: 'Map' })).toBeInTheDocument()
    })
    expect(screen.queryByRole('region', { name: 'Budget' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Journal' })).not.toBeInTheDocument()
  })

  it('shows loading state while fetching', async () => {
    vi.mocked(api.fetchDay).mockImplementation(() => new Promise(() => {}))
    renderShellAtDay('2026-06-01')
    expect(screen.getByText('Loading day…')).toBeInTheDocument()
  })

  it('shows error when fetch fails', async () => {
    vi.mocked(api.fetchDay).mockRejectedValue(new Error('network'))
    renderShellAtDay('2026-06-01')
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Could not load day.')
    })
  })
})

describe('datesInRange', () => {
  it('returns YYYY-MM-DD strings for every date in range', () => {
    const dates = api.datesInRange('2026-06-01', '2026-06-03')
    expect(dates).toEqual(['2026-06-01', '2026-06-02', '2026-06-03'])
  })

  it('returns a single date for a one-day range', () => {
    expect(api.datesInRange('2026-06-01', '2026-06-01')).toEqual(['2026-06-01'])
  })
})
