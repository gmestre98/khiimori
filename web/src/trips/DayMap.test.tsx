import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import DayMap from './DayMap'
import * as api from '../lib/api'
import type { Day } from '../lib/api'

vi.mock('../lib/api', async (importOriginal) => {
  const orig = await importOriginal<typeof api>()
  return {
    ...orig,
    fetchDayRoute: vi.fn(),
    staticMapUrl: vi.fn(),
  }
})

function makeDay(overrides?: Partial<Day>): Day {
  return {
    id: 'day-1',
    trip_id: 'trip-1',
    date: '2026-06-01',
    index: 0,
    notes: '',
    stays: [],
    plan_items: [],
    ...overrides,
  }
}

describe('DayMap', () => {
  beforeEach(() => {
    vi.mocked(api.fetchDayRoute).mockResolvedValue({ waypoints: [] })
    vi.mocked(api.staticMapUrl).mockReturnValue(null)
  })

  afterEach(() => {
    cleanup()
    vi.resetAllMocks()
  })

  it('shows loading while fetching waypoints', () => {
    vi.mocked(api.fetchDayRoute).mockReturnValue(new Promise(() => {}))
    render(
      <DayMap
        day={makeDay({
          stays: [{ id: 's1', trip_id: 'trip-1', name: 'Hotel', location: 'Paris' }],
        })}
      />,
    )
    expect(screen.getByText('Loading map…')).toBeTruthy()
  })

  it('shows empty state when no located items', async () => {
    render(<DayMap day={makeDay()} />)
    await waitFor(() => {
      expect(screen.getByText('No located stops for this day.')).toBeTruthy()
    })
    expect(api.fetchDayRoute).not.toHaveBeenCalled()
  })

  it('shows empty state when all waypoints unresolvable', async () => {
    vi.mocked(api.fetchDayRoute).mockResolvedValue({ waypoints: [] })
    render(
      <DayMap
        day={makeDay({
          stays: [{ id: 's1', trip_id: 'trip-1', name: 'Hotel', location: 'Nowhere' }],
        })}
      />,
    )
    await waitFor(() => {
      expect(screen.getByText('No located stops for this day.')).toBeTruthy()
    })
  })

  it('renders map img when waypoints are returned', async () => {
    const waypoints = [
      { lat: 48.8566, lng: 2.3522 },
      { lat: 48.86, lng: 2.36 },
    ]
    vi.mocked(api.fetchDayRoute).mockResolvedValue({ waypoints })
    vi.mocked(api.staticMapUrl).mockReturnValue('http://localhost:8080/geo/static-map?markers=...')
    render(
      <DayMap
        day={makeDay({
          stays: [{ id: 's1', trip_id: 'trip-1', name: 'Hotel', location: 'Paris' }],
          plan_items: [
            {
              id: 'i1',
              trip_id: 'trip-1',
              day_id: 'day-1',
              title: 'Eiffel Tower',
              location: 'Eiffel Tower, Paris',
              sort_order: 0,
              status: 'planned',
            },
          ],
        })}
      />,
    )
    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'Map for 2026-06-01' })).toBeTruthy()
    })
  })

  it('shows error state when fetchDayRoute rejects', async () => {
    vi.mocked(api.fetchDayRoute).mockRejectedValue(new Error('network'))
    render(
      <DayMap
        day={makeDay({
          stays: [{ id: 's1', trip_id: 'trip-1', name: 'Hotel', location: 'Paris' }],
        })}
      />,
    )
    await waitFor(() => {
      expect(screen.getByText('Map unavailable.')).toBeTruthy()
    })
  })

  it('passes locations in itinerary order (stay first, then plan items by sort_order)', async () => {
    vi.mocked(api.fetchDayRoute).mockResolvedValue({ waypoints: [] })
    render(
      <DayMap
        day={makeDay({
          stays: [{ id: 's1', trip_id: 'trip-1', name: 'Hotel', location: 'Stay loc' }],
          plan_items: [
            {
              id: 'i2',
              trip_id: 'trip-1',
              day_id: 'day-1',
              title: 'Item B',
              location: 'Loc B',
              sort_order: 1,
              status: 'planned',
            },
            {
              id: 'i1',
              trip_id: 'trip-1',
              day_id: 'day-1',
              title: 'Item A',
              location: 'Loc A',
              sort_order: 0,
              status: 'planned',
            },
          ],
        })}
      />,
    )
    await waitFor(() => {
      expect(api.fetchDayRoute).toHaveBeenCalledWith(
        ['Stay loc', 'Loc A', 'Loc B'],
        expect.any(AbortSignal),
      )
    })
  })
})
