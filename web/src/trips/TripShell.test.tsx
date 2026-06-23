import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
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
  return { id: `day-${index}`, trip_id: 'trip-1', date, index, notes: '' }
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
    await waitFor(() => expect(screen.getByText('Paris, London')).toBeInTheDocument())
  })

  it('renders back link to trips dashboard', async () => {
    renderShellAtDay('2026-06-01')
    await waitFor(() => {
      const link = screen.getByRole('link', { name: /back to trips/i })
      expect(link).toHaveAttribute('href', '/')
    })
  })

  it('renders edit link for the trip', async () => {
    renderShellAtDay('2026-06-01')
    await waitFor(() => {
      const link = screen.getByRole('link', { name: /edit test trip/i })
      expect(link).toHaveAttribute('href', '/trips/trip-1/edit')
    })
  })
})

describe('DayNav', () => {
  it('disables Prev on the first day', async () => {
    renderShellAtDay('2026-06-01')
    await waitFor(() => {
      expect(screen.getByText('‹ Prev')).toHaveAttribute('aria-disabled', 'true')
    })
  })

  it('disables Next on the last day', async () => {
    renderShellAtDay('2026-06-05')
    await waitFor(() => {
      expect(screen.getByText('Next ›')).toHaveAttribute('aria-disabled', 'true')
    })
  })

  it('renders Next link on a non-last day', async () => {
    renderShellAtDay('2026-06-01')
    await waitFor(() => {
      const next = screen.getByRole('link', { name: /next day/i })
      expect(next).toHaveAttribute('href', '/trips/trip-1/days/2026-06-02')
    })
  })

  it('renders Prev link on a non-first day', async () => {
    renderShellAtDay('2026-06-03')
    await waitFor(() => {
      const prev = screen.getByRole('link', { name: /previous day/i })
      expect(prev).toHaveAttribute('href', '/trips/trip-1/days/2026-06-02')
    })
  })

  it('renders a day-select with all trip days', async () => {
    renderShellAtDay('2026-06-01')
    await waitFor(() => {
      const select = screen.getByRole('combobox', { name: /jump to day/i })
      expect(select).toBeInTheDocument()
      // 5 days: June 1–5
      expect(select.querySelectorAll('option').length).toBe(5)
    })
  })
})

describe('DayView', () => {
  it('shows the day number and date', async () => {
    vi.mocked(api.fetchDay).mockResolvedValue(makeMockDay('2026-06-03', 2))
    renderShellAtDay('2026-06-03')
    await waitFor(() => {
      expect(screen.getByText('Day 3')).toBeInTheDocument()
      expect(screen.getByText('2026-06-03')).toBeInTheDocument()
    })
  })

  it('renders all four mount-point slots', async () => {
    renderShellAtDay('2026-06-01')
    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Planning' })).toBeInTheDocument()
      expect(screen.getByRole('region', { name: 'Budget' })).toBeInTheDocument()
      expect(screen.getByRole('region', { name: 'Journal' })).toBeInTheDocument()
      expect(screen.getByRole('region', { name: 'Map' })).toBeInTheDocument()
    })
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
